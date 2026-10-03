/// The YouTube page of a trailer; `None` unless `youtube_id` is a plain video id.
fn trailer_url(youtube_id: &str) -> Option<String> {
    let well_formed = youtube_id.len() == 11
        && youtube_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    well_formed.then(|| format!("https://www.youtube.com/watch?v={youtube_id}"))
}

/// Opens a trailer in the system browser. Only YouTube ids are accepted, so
/// this can never become a generic "open any URL or file" command.
#[tauri::command]
pub async fn open_trailer(youtube_id: String) -> Result<(), String> {
    let url = trailer_url(&youtube_id).ok_or("Invalid trailer id")?;
    open::that_detached(url).map_err(|e| format!("Failed to open the trailer: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_well_formed_youtube_trailers() {
        assert_eq!(
            trailer_url("FVI84Dfx2-I").as_deref(),
            Some("https://www.youtube.com/watch?v=FVI84Dfx2-I")
        );
        assert_eq!(trailer_url("FVI84Dfx2-"), None);
        assert_eq!(trailer_url("FVI84Dfx2-I&x"), None);
        assert_eq!(trailer_url("../../../etc"), None);
        assert_eq!(trailer_url("https://evil"), None);
    }
}
