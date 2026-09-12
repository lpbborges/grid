use regex::Regex;

pub fn srt_to_vtt(input: &str) -> String {
    let re = Regex::new(r"(\d{2}:\d{2}:\d{2}),(\d{3})").unwrap();
    let converted = re.replace_all(input, "$1.$2");
    format!("WEBVTT\n\n{}", converted)
}

pub fn is_valid_info_hash(value: &str) -> bool {
    let len = value.len();
    (len == 40 || len == 64) && value.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn is_valid_file_idx(value: i64) -> bool {
    value >= 0
}

pub fn is_allowed_subtitle_url(raw_url: &str) -> bool {
    match reqwest::Url::parse(raw_url) {
        Ok(parsed) => {
            if parsed.scheme() != "https" {
                return false;
            }
            match parsed.host_str() {
                Some(host) => host == "strem.io" || host.ends_with(".strem.io"),
                None => false,
            }
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_through_content_already_in_vtt() {
        // Mirrors src/lib/api/subtitles.ts::srtToVtt behavior: it does NOT
        // detect already-VTT content itself — that check lives in the caller
        // (the command handler). This function always prepends WEBVTT and
        // fixes timestamp separators.
        let srt = "1\n00:00:01,000 --> 00:00:02,500\nHello\n";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.starts_with("WEBVTT\n\n"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:02.500"));
        assert!(vtt.contains("Hello"));
    }

    #[test]
    fn replaces_all_timestamp_commas_not_just_first() {
        let srt = "00:00:01,000 --> 00:00:02,500\nA\n\n00:00:03,100 --> 00:00:04,900\nB\n";
        let vtt = srt_to_vtt(srt);
        assert!(!vtt.contains(','));
    }

    #[test]
    fn accepts_40_char_hex_info_hash() {
        assert!(is_valid_info_hash("a".repeat(40).as_str()));
    }

    #[test]
    fn accepts_64_char_hex_info_hash() {
        assert!(is_valid_info_hash("b".repeat(64).as_str()));
    }

    #[test]
    fn rejects_wrong_length_or_non_hex_info_hash() {
        assert!(!is_valid_info_hash("a".repeat(39).as_str()));
        assert!(!is_valid_info_hash("z".repeat(40).as_str()));
        assert!(!is_valid_info_hash(""));
    }

    #[test]
    fn accepts_non_negative_file_idx() {
        assert!(is_valid_file_idx(0));
        assert!(is_valid_file_idx(42));
    }

    #[test]
    fn rejects_negative_file_idx() {
        assert!(!is_valid_file_idx(-1));
    }

    #[test]
    fn allows_strem_io_and_subdomains_https_only() {
        assert!(is_allowed_subtitle_url("https://strem.io/x.srt"));
        assert!(is_allowed_subtitle_url("https://subs5.strem.io/x.srt"));
        assert!(!is_allowed_subtitle_url("http://subs5.strem.io/x.srt"));
        assert!(!is_allowed_subtitle_url("https://evil.com/strem.io"));
        assert!(!is_allowed_subtitle_url("https://strem.io.evil.com/x.srt"));
        assert!(!is_allowed_subtitle_url("not a url"));
    }
}
