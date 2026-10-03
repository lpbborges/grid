//! Commands over the video cache: its manifest, eviction and clearing.

use crate::{cache, subtitles};
use std::path::Path;
use tauri::Manager;

#[tauri::command]
pub async fn get_cache_manifest(app: tauri::AppHandle) -> Result<Vec<cache::CacheEntry>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        cache::read_manifest(&cache::manifest_path(&app_data_dir)).entries
    })
    .await
    .map_err(|e| format!("Cache manifest task failed: {}", e))
}

#[tauri::command]
pub async fn upsert_cache_entry(
    app: tauri::AppHandle,
    entry: cache::CacheEntry,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || upsert_cache_entry_blocking(&app_data_dir, entry))
        .await
        .map_err(|e| format!("Cache update task failed: {}", e))?
}

fn upsert_cache_entry_blocking(
    app_data_dir: &Path,
    entry: cache::CacheEntry,
) -> Result<(), String> {
    if !subtitles::is_valid_info_hash(&entry.info_hash) {
        return Err("Invalid info hash".to_string());
    }
    if !cache::is_relative_path_inside(&entry.file_name) {
        return Err("Invalid cache file name".to_string());
    }
    cache::update_manifest(&cache::manifest_path(app_data_dir), |manifest| {
        cache::upsert_entry(manifest, entry)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn evict_for_space(
    app: tauri::AppHandle,
    exclude_info_hash: String,
    needed_bytes: u64,
    limit_bytes: u64,
) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        evict_for_space_blocking(&app_data_dir, &exclude_info_hash, needed_bytes, limit_bytes)
    })
    .await
    .map_err(|e| format!("Cache eviction task failed: {}", e))?
}

fn evict_for_space_blocking(
    app_data_dir: &Path,
    exclude_info_hash: &str,
    needed_bytes: u64,
    limit_bytes: u64,
) -> Result<Vec<String>, String> {
    let downloads_dir = cache::downloads_dir(app_data_dir);
    cache::update_manifest(&cache::manifest_path(app_data_dir), |manifest| {
        let to_evict =
            cache::pick_eviction_candidates(manifest, exclude_info_hash, needed_bytes, limit_bytes);

        for info_hash in &to_evict {
            if let Some(entry) = cache::remove_entry(manifest, info_hash) {
                cache::remove_entry_files(&downloads_dir, &entry);
            }
        }
        to_evict
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_cache(
    app: tauri::AppHandle,
    exclude_info_hash: Option<String>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        clear_cache_blocking(&app_data_dir, exclude_info_hash.as_deref())
    })
    .await
    .map_err(|e| format!("Cache clearing task failed: {}", e))?
}

fn clear_cache_blocking(
    app_data_dir: &Path,
    exclude_info_hash: Option<&str>,
) -> Result<(), String> {
    if exclude_info_hash.is_some_and(|hash| !subtitles::is_valid_info_hash(hash)) {
        return Err("Invalid info hash".to_string());
    }
    let downloads_dir = cache::downloads_dir(app_data_dir);
    cache::update_manifest(&cache::manifest_path(app_data_dir), |manifest| {
        let (kept, removed) = std::mem::take(&mut manifest.entries)
            .into_iter()
            .partition(|entry| Some(entry.info_hash.as_str()) == exclude_info_hash);
        manifest.entries = kept;
        for entry in &removed {
            cache::remove_entry_files(&downloads_dir, entry);
        }
        for name in cache::find_orphan_top_level_names(&downloads_dir, manifest) {
            if Some(name.as_str()) != exclude_info_hash {
                cache::remove_path_best_effort(&downloads_dir.join(name));
            }
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn eviction_removes_every_file_of_a_season_pack() {
        let app_data_dir =
            std::env::temp_dir().join(format!("grid-evict-pack-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&app_data_dir);
        let hash = "a".repeat(40);
        let pack = cache::downloads_dir(&app_data_dir).join(&hash).join("Show");
        std::fs::create_dir_all(&pack).unwrap();
        std::fs::write(pack.join("S01E01.mkv"), b"one").unwrap();
        std::fs::write(pack.join("S01E02.mkv"), b"two").unwrap();
        let manifest = cache::Manifest {
            entries: vec![cache::CacheEntry {
                info_hash: hash.clone(),
                magnet: String::new(),
                media_id: None,
                season: Some(1),
                episode: Some(2),
                file_name: format!("{hash}/Show/S01E02.mkv"),
                total_bytes: 100,
                downloaded_bytes: 100,
                complete: true,
                last_accessed_at: 0,
            }],
        };
        cache::write_manifest(&cache::manifest_path(&app_data_dir), &manifest).unwrap();

        let evicted = evict_for_space_blocking(&app_data_dir, "other", 50, 100).unwrap();

        assert_eq!(evicted, vec![hash.clone()]);
        assert!(!cache::downloads_dir(&app_data_dir).join(&hash).exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    fn cached_movie(hash: &str) -> cache::CacheEntry {
        cache::CacheEntry {
            info_hash: hash.to_string(),
            magnet: String::new(),
            media_id: None,
            season: None,
            episode: None,
            file_name: format!("{hash}/movie.mkv"),
            total_bytes: 100,
            downloaded_bytes: 100,
            complete: true,
            last_accessed_at: 0,
        }
    }

    fn write_video(app_data_dir: &Path, hash: &str) {
        let folder = cache::downloads_dir(app_data_dir).join(hash);
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("movie.mkv"), b"video").unwrap();
    }

    fn fresh_app_data_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("grid-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn clearing_the_cache_deletes_every_video_and_empties_the_manifest() {
        let app_data_dir = fresh_app_data_dir("clear-all");
        let (cached, orphan) = ("a".repeat(40), "c".repeat(40));
        write_video(&app_data_dir, &cached);
        write_video(&app_data_dir, &orphan);
        let outside = app_data_dir.join("outside.mkv");
        std::fs::write(&outside, b"keep").unwrap();
        let manifest = cache::Manifest {
            entries: vec![cached_movie(&cached)],
        };
        cache::write_manifest(&cache::manifest_path(&app_data_dir), &manifest).unwrap();

        clear_cache_blocking(&app_data_dir, None).unwrap();

        let left: Vec<_> = std::fs::read_dir(cache::downloads_dir(&app_data_dir))
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(left, vec!["manifest.json"]);
        let manifest = cache::read_manifest(&cache::manifest_path(&app_data_dir));
        assert!(manifest.entries.is_empty());
        assert!(outside.exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn clearing_the_cache_keeps_the_video_being_streamed() {
        let app_data_dir = fresh_app_data_dir("clear-keep");
        let (playing, cached) = ("a".repeat(40), "b".repeat(40));
        write_video(&app_data_dir, &playing);
        write_video(&app_data_dir, &cached);
        let manifest = cache::Manifest {
            entries: vec![cached_movie(&playing), cached_movie(&cached)],
        };
        cache::write_manifest(&cache::manifest_path(&app_data_dir), &manifest).unwrap();

        clear_cache_blocking(&app_data_dir, Some(&playing)).unwrap();

        let manifest = cache::read_manifest(&cache::manifest_path(&app_data_dir));
        assert_eq!(manifest.entries, vec![cached_movie(&playing)]);
        assert!(cache::downloads_dir(&app_data_dir).join(&playing).exists());
        assert!(!cache::downloads_dir(&app_data_dir).join(&cached).exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn clearing_the_cache_keeps_a_stream_not_yet_in_the_manifest() {
        let app_data_dir = fresh_app_data_dir("clear-adding");
        let playing = "d".repeat(40);
        write_video(&app_data_dir, &playing);

        clear_cache_blocking(&app_data_dir, Some(&playing)).unwrap();

        assert!(cache::downloads_dir(&app_data_dir).join(&playing).exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn clearing_the_cache_rejects_an_invalid_stream_to_keep() {
        let app_data_dir = fresh_app_data_dir("clear-invalid");

        assert!(clear_cache_blocking(&app_data_dir, Some("../x")).is_err());
    }

    #[test]
    fn concurrent_cache_updates_keep_every_entry() {
        let app_data_dir =
            std::env::temp_dir().join(format!("grid-cache-concurrent-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&app_data_dir);
        let hashes: Vec<String> = (0..16).map(|i| format!("{i:040x}")).collect();

        std::thread::scope(|scope| {
            for hash in &hashes {
                let app_data_dir = &app_data_dir;
                scope.spawn(move || {
                    upsert_cache_entry_blocking(
                        app_data_dir,
                        cache::CacheEntry {
                            info_hash: hash.clone(),
                            magnet: String::new(),
                            media_id: None,
                            season: None,
                            episode: None,
                            file_name: format!("{hash}/movie.mkv"),
                            total_bytes: 100,
                            downloaded_bytes: 0,
                            complete: false,
                            last_accessed_at: 0,
                        },
                    )
                    .unwrap();
                });
            }
        });

        let manifest = cache::read_manifest(&cache::manifest_path(&app_data_dir));
        let mut stored: Vec<String> = manifest.entries.into_iter().map(|e| e.info_hash).collect();
        stored.sort();
        assert_eq!(stored, hashes);
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn upsert_refuses_an_entry_that_is_not_a_well_formed_download() {
        let app_data_dir = fresh_app_data_dir("upsert-invalid");
        let hash = "c".repeat(40);
        let bad_hash = cache::CacheEntry {
            info_hash: "not-a-hash".to_string(),
            ..cached_movie(&hash)
        };
        let traversal = cache::CacheEntry {
            file_name: "../outside.mkv".to_string(),
            ..cached_movie(&hash)
        };
        let absolute = cache::CacheEntry {
            file_name: "/etc/passwd".to_string(),
            ..cached_movie(&hash)
        };

        for entry in [bad_hash, traversal, absolute] {
            assert!(upsert_cache_entry_blocking(&app_data_dir, entry).is_err());
        }

        let manifest = cache::read_manifest(&cache::manifest_path(&app_data_dir));
        assert!(manifest.entries.is_empty());
        upsert_cache_entry_blocking(&app_data_dir, cached_movie(&hash)).unwrap();
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[test]
    fn eviction_never_deletes_outside_the_downloads_folder() {
        let app_data_dir =
            std::env::temp_dir().join(format!("grid-evict-escape-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&app_data_dir);
        std::fs::create_dir_all(cache::downloads_dir(&app_data_dir)).unwrap();
        let outside = app_data_dir.join("outside.mkv");
        std::fs::write(&outside, b"keep").unwrap();
        let manifest = cache::Manifest {
            entries: vec![cache::CacheEntry {
                info_hash: "b".repeat(40),
                magnet: String::new(),
                media_id: None,
                season: None,
                episode: None,
                file_name: "../outside.mkv".to_string(),
                total_bytes: 100,
                downloaded_bytes: 100,
                complete: true,
                last_accessed_at: 0,
            }],
        };
        cache::write_manifest(&cache::manifest_path(&app_data_dir), &manifest).unwrap();

        evict_for_space_blocking(&app_data_dir, "other", 50, 100).unwrap();

        assert!(outside.exists());
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }
}
