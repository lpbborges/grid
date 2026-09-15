use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub info_hash: String,
    pub magnet: String,
    pub media_id: Option<String>,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub file_name: String,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub complete: bool,
    pub last_accessed_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Manifest {
    pub entries: Vec<CacheEntry>,
}

pub fn downloads_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("downloads")
}

pub fn manifest_path(app_data_dir: &Path) -> PathBuf {
    downloads_dir(app_data_dir).join("manifest.json")
}

/// Never fails: a missing or corrupt manifest file is treated as an empty
/// cache rather than an error, since losing the manifest should degrade to
/// "re-download everything," not break the app.
pub fn read_manifest(path: &Path) -> Manifest {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn write_manifest(path: &Path, manifest: &Manifest) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let tmp_path = path.with_extension("json.tmp");
    {
        let mut file = std::fs::File::create(&tmp_path)?;
        std::io::Write::write_all(&mut file, json.as_bytes())?;
        file.sync_all()?;
    }
    std::fs::rename(&tmp_path, path)
}

pub fn upsert_entry(manifest: &mut Manifest, entry: CacheEntry) {
    if let Some(existing) = manifest
        .entries
        .iter_mut()
        .find(|e| e.info_hash == entry.info_hash)
    {
        *existing = entry;
    } else {
        manifest.entries.push(entry);
    }
}

pub fn remove_entry(manifest: &mut Manifest, info_hash: &str) -> Option<CacheEntry> {
    let pos = manifest
        .entries
        .iter()
        .position(|e| e.info_hash == info_hash)?;
    Some(manifest.entries.remove(pos))
}

pub fn total_usage(manifest: &Manifest) -> u64 {
    manifest.entries.iter().map(|e| e.downloaded_bytes).sum()
}

pub fn pick_eviction_candidates(
    manifest: &Manifest,
    exclude_info_hash: &str,
    needed_bytes: u64,
    limit_bytes: u64,
) -> Vec<String> {
    let mut candidates: Vec<&CacheEntry> = manifest
        .entries
        .iter()
        .filter(|e| e.info_hash != exclude_info_hash)
        .collect();
    candidates.sort_by_key(|e| e.last_accessed_at);

    let mut usage = total_usage(manifest);
    let mut evicted = Vec::new();

    for entry in candidates {
        if usage + needed_bytes <= limit_bytes {
            break;
        }
        usage -= entry.downloaded_bytes;
        evicted.push(entry.info_hash.clone());
    }

    evicted
}

pub fn find_orphan_top_level_names(downloads_dir: &Path, manifest: &Manifest) -> Vec<String> {
    let known: std::collections::HashSet<String> = manifest
        .entries
        .iter()
        .map(|e| {
            std::path::Path::new(&e.file_name)
                .components()
                .next()
                .and_then(|c| c.as_os_str().to_str())
                .unwrap_or(&e.file_name)
                .to_string()
        })
        .collect();

    let Ok(read_dir) = std::fs::read_dir(downloads_dir) else {
        return Vec::new();
    };

    read_dir
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name != "manifest.json" && !known.contains(name))
        .collect()
}

pub fn remove_path_best_effort(path: &Path) {
    if path.is_dir() {
        let _ = std::fs::remove_dir_all(path);
    } else {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(hash: &str, downloaded: u64, last_accessed_at: i64) -> CacheEntry {
        CacheEntry {
            info_hash: hash.to_string(),
            magnet: format!("magnet:?xt=urn:btih:{}", hash),
            media_id: None,
            season: None,
            episode: None,
            file_name: format!("{}.mkv", hash),
            total_bytes: downloaded,
            downloaded_bytes: downloaded,
            complete: true,
            last_accessed_at,
        }
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("grid-cache-test-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_manifest_returns_empty_for_missing_file() {
        let dir = unique_test_dir("missing");
        let manifest = read_manifest(&manifest_path(&dir));
        assert_eq!(manifest.entries.len(), 0);
    }

    #[test]
    fn read_manifest_returns_empty_for_corrupt_file() {
        let dir = unique_test_dir("corrupt");
        let path = manifest_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "not json").unwrap();
        let manifest = read_manifest(&path);
        assert_eq!(manifest.entries.len(), 0);
    }

    #[test]
    fn write_then_read_manifest_round_trips() {
        let dir = unique_test_dir("roundtrip");
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("abc123", 500, 1));
        write_manifest(&manifest_path(&dir), &manifest).unwrap();

        let reloaded = read_manifest(&manifest_path(&dir));
        assert_eq!(reloaded.entries.len(), 1);
        assert_eq!(reloaded.entries[0].info_hash, "abc123");
        assert_eq!(reloaded.entries[0].downloaded_bytes, 500);
    }

    #[test]
    fn write_manifest_leaves_no_temp_file_behind() {
        let dir = unique_test_dir("atomic-no-tmp");
        let path = manifest_path(&dir);
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("first", 100, 1));
        write_manifest(&path, &manifest).unwrap();
        upsert_entry(&mut manifest, entry("second", 200, 2));
        write_manifest(&path, &manifest).unwrap();

        let names: Vec<String> = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        assert_eq!(names, vec!["manifest.json".to_string()]);
        assert_eq!(read_manifest(&path).entries.len(), 2);
    }

    #[test]
    fn upsert_entry_replaces_existing_by_info_hash() {
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("abc", 100, 1));
        upsert_entry(&mut manifest, entry("abc", 200, 2));
        assert_eq!(manifest.entries.len(), 1);
        assert_eq!(manifest.entries[0].downloaded_bytes, 200);
    }

    #[test]
    fn remove_entry_removes_and_returns_it() {
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("abc", 100, 1));
        let removed = remove_entry(&mut manifest, "abc");
        assert!(removed.is_some());
        assert_eq!(manifest.entries.len(), 0);
    }

    #[test]
    fn remove_entry_returns_none_when_not_found() {
        let mut manifest = Manifest { entries: vec![] };
        assert!(remove_entry(&mut manifest, "missing").is_none());
    }

    #[test]
    fn total_usage_sums_downloaded_bytes() {
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("a", 100, 1));
        upsert_entry(&mut manifest, entry("b", 250, 2));
        assert_eq!(total_usage(&manifest), 350);
    }

    #[test]
    fn pick_eviction_candidates_returns_empty_when_already_fits() {
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("a", 100, 1));
        let candidates = pick_eviction_candidates(&manifest, "new", 50, 1000);
        assert!(candidates.is_empty());
    }

    #[test]
    fn pick_eviction_candidates_picks_oldest_first() {
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("oldest", 400, 1));
        upsert_entry(&mut manifest, entry("middle", 400, 2));
        upsert_entry(&mut manifest, entry("newest", 400, 3));
        // limit 1000, needed 400: current usage 1200 -> must free at least 600.
        // Evicting "oldest" (400) leaves 800 used + 400 needed = 1200 > 1000, still over.
        // Evicting "middle" too leaves 400 used + 400 needed = 800 <= 1000: stop there.
        let candidates = pick_eviction_candidates(&manifest, "new", 400, 1000);
        assert_eq!(candidates, vec!["oldest".to_string(), "middle".to_string()]);
    }

    #[test]
    fn pick_eviction_candidates_never_evicts_the_excluded_hash() {
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("current", 100, 1));
        let candidates = pick_eviction_candidates(&manifest, "current", 5000, 1000);
        assert!(!candidates.contains(&"current".to_string()));
    }

    #[test]
    fn downloads_dir_and_manifest_path_are_under_app_data_dir() {
        let app_data = PathBuf::from("/tmp/example-app-data");
        assert_eq!(downloads_dir(&app_data), app_data.join("downloads"));
        assert_eq!(
            manifest_path(&app_data),
            app_data.join("downloads").join("manifest.json")
        );
    }

    #[test]
    fn find_orphan_top_level_names_ignores_manifest_json() {
        let dir = unique_test_dir("orphan-manifest-json");
        std::fs::write(dir.join("manifest.json"), "{}").unwrap();
        let manifest = Manifest { entries: vec![] };
        let orphans = find_orphan_top_level_names(&dir, &manifest);
        assert!(!orphans.contains(&"manifest.json".to_string()));
    }

    #[test]
    fn find_orphan_top_level_names_flags_untracked_top_level_file() {
        let dir = unique_test_dir("orphan-untracked-file");
        std::fs::write(dir.join("leftover.mkv"), "data").unwrap();
        let manifest = Manifest { entries: vec![] };
        let orphans = find_orphan_top_level_names(&dir, &manifest);
        assert_eq!(orphans, vec!["leftover.mkv".to_string()]);
    }

    #[test]
    fn find_orphan_top_level_names_does_not_flag_tracked_flat_file() {
        let dir = unique_test_dir("orphan-tracked-flat");
        std::fs::write(dir.join("movie.mkv"), "data").unwrap();
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("hash1", 4, 1));
        manifest.entries[0].file_name = "movie.mkv".to_string();
        let orphans = find_orphan_top_level_names(&dir, &manifest);
        assert!(orphans.is_empty());
    }

    #[test]
    fn find_orphan_top_level_names_does_not_flag_tracked_subfolder() {
        let dir = unique_test_dir("orphan-tracked-subfolder");
        std::fs::create_dir_all(dir.join("hash1")).unwrap();
        std::fs::write(dir.join("hash1").join("movie.mkv"), "data").unwrap();
        let mut manifest = Manifest { entries: vec![] };
        upsert_entry(&mut manifest, entry("hash1", 4, 1));
        manifest.entries[0].file_name = "hash1/movie.mkv".to_string();
        let orphans = find_orphan_top_level_names(&dir, &manifest);
        assert!(orphans.is_empty());
    }

    #[test]
    fn remove_path_best_effort_deletes_file_and_directory() {
        let dir = unique_test_dir("remove-best-effort");
        let file = dir.join("a.txt");
        std::fs::write(&file, "x").unwrap();
        remove_path_best_effort(&file);
        assert!(!file.exists());

        let subdir = dir.join("sub");
        std::fs::create_dir_all(&subdir).unwrap();
        std::fs::write(subdir.join("b.txt"), "x").unwrap();
        remove_path_best_effort(&subdir);
        assert!(!subdir.exists());
    }

    #[test]
    fn remove_path_best_effort_does_not_panic_on_missing_path() {
        let dir = unique_test_dir("remove-best-effort-missing");
        remove_path_best_effort(&dir.join("does-not-exist"));
    }
}
