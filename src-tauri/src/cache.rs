use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[allow(dead_code)]
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

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Manifest {
    pub entries: Vec<CacheEntry>,
}

#[allow(dead_code)]
pub fn downloads_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("downloads")
}

#[allow(dead_code)]
pub fn manifest_path(app_data_dir: &Path) -> PathBuf {
    downloads_dir(app_data_dir).join("manifest.json")
}

/// Never fails: a missing or corrupt manifest file is treated as an empty
/// cache rather than an error, since losing the manifest should degrade to
/// "re-download everything," not break the app.
#[allow(dead_code)]
pub fn read_manifest(path: &Path) -> Manifest {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[allow(dead_code)]
pub fn write_manifest(path: &Path, manifest: &Manifest) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(manifest)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(path, json)
}

#[allow(dead_code)]
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

#[allow(dead_code)]
pub fn remove_entry(manifest: &mut Manifest, info_hash: &str) -> Option<CacheEntry> {
    let pos = manifest
        .entries
        .iter()
        .position(|e| e.info_hash == info_hash)?;
    Some(manifest.entries.remove(pos))
}

#[allow(dead_code)]
pub fn total_usage(manifest: &Manifest) -> u64 {
    manifest.entries.iter().map(|e| e.downloaded_bytes).sum()
}

#[allow(dead_code)]
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
        let dir = std::env::temp_dir().join(format!(
            "grid-play-cache-test-{}-{}",
            name,
            std::process::id()
        ));
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
}
