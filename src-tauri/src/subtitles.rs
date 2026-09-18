use regex::Regex;
use std::sync::LazyLock;

static CUE_ID_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+\s*$").unwrap());
static TIMING_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}").unwrap()
});
static COMMA_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(\d{2}:\d{2}:\d{2}),(\d{3})").unwrap());
static ASS_TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{\\[^}]+\}").unwrap());

/// Converts SRT subtitle content to WebVTT.
///
/// Handles:
/// - Optional numeric cue-identifier lines that precede a timing line (SRT
///   allows these; VTT doesn't require them, so they're dropped).
/// - Multi-line cue text (VTT and SRT both allow several text lines per cue;
///   lines are passed through unchanged).
/// - Basic styling tags (`<i>`, `<b>`, `<u>`) — VTT supports these natively
///   in cue text, so they're left untouched rather than stripped/escaped.
/// - ASS formatting tags like `{\an8}` — these are stripped so they don't leak into the UI.
/// - Timestamp separators (`,` -> `.`).
///
/// Empty or malformed input never panics: it's returned as-is (minus any
/// cue-identifier stripping that still applies) under the WEBVTT header.
pub fn srt_to_vtt(input: &str) -> String {
    let normalized = input.replace("\r\n", "\n").replace('\r', "\n");

    let lines: Vec<&str> = normalized.lines().collect();
    let mut out_lines: Vec<&str> = Vec::with_capacity(lines.len());
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        let at_cue_block_start =
            i == 0 || lines.get(i - 1).is_some_and(|prev| prev.trim().is_empty());
        let is_cue_identifier = at_cue_block_start
            && CUE_ID_RE.is_match(line)
            && lines
                .get(i + 1)
                .is_some_and(|next| TIMING_RE.is_match(next.trim()));
        if !is_cue_identifier {
            out_lines.push(line);
        }
        i += 1;
    }

    let mut joined = out_lines.join("\n");
    if normalized.ends_with('\n') && !normalized.is_empty() {
        joined.push('\n');
    }

    let without_ass = ASS_TAG_RE.replace_all(&joined, "");
    let converted = COMMA_RE.replace_all(&without_ass, "$1.$2");
    format!("WEBVTT\n\n{}", converted)
}

pub fn is_valid_info_hash(value: &str) -> bool {
    let len = value.len();
    (len == 40 || len == 64) && value.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn is_valid_file_idx(value: i64) -> bool {
    value >= 0
}

/// Whether `name` (a torrent file's path/name, as reported by the torrent
/// engine) looks like a subtitle file. Used to reject `file_idx` values that
/// resolve to a non-subtitle file (e.g. the main video) before we ever fetch
/// its contents — the file could be multiple gigabytes.
pub fn is_subtitle_file_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".srt") || lower.ends_with(".vtt")
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
    fn strips_numeric_cue_identifier_lines() {
        let srt =
            "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n";
        let vtt = srt_to_vtt(srt);
        // Cue identifier lines are removed entirely, not just left as stray digits.
        assert_eq!(
            vtt,
            "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld\n"
        );
    }

    #[test]
    fn works_without_cue_identifiers() {
        let srt = "00:00:01,000 --> 00:00:02,500\nHello\n\n00:00:03,000 --> 00:00:04,000\nWorld\n";
        let vtt = srt_to_vtt(srt);
        assert_eq!(
            vtt,
            "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld\n"
        );
    }

    #[test]
    fn preserves_multi_line_cue_text() {
        let srt = "1\n00:00:01,000 --> 00:00:05,000\nFirst line\nSecond line\nThird line\n";
        let vtt = srt_to_vtt(srt);
        assert_eq!(
            vtt,
            "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nFirst line\nSecond line\nThird line\n"
        );
    }

    #[test]
    fn preserves_basic_styling_tags() {
        let srt = "1\n00:00:01,000 --> 00:00:02,000\n<i>italic</i> <b>bold</b> <u>underline</u>\n";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.contains("<i>italic</i> <b>bold</b> <u>underline</u>"));
    }

    #[test]
    fn strips_ass_formatting_tags() {
        let srt = "1\n00:00:01,000 --> 00:00:02,000\n{\\an8}Top Text\n{\\pos(10,10)}Positioned\n";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.contains("Top Text"));
        assert!(vtt.contains("Positioned"));
        assert!(!vtt.contains("{\\an8}"));
        assert!(!vtt.contains("{\\pos"));
    }

    #[test]
    fn does_not_drop_numeric_cue_text_when_the_next_cue_lacks_a_blank_separator() {
        // A cue whose sole text line is purely numeric ("5") must not be
        // mistaken for a cue identifier just because the following line
        // happens to be a timing line for the *next* cue. A real cue
        // identifier only ever appears at the start of the file or right
        // after the blank line separating cues.
        let srt = "00:00:01,000 --> 00:00:02,000\n5\n00:00:03,000 --> 00:00:04,000\nWorld\n";
        let vtt = srt_to_vtt(srt);
        assert_eq!(
            vtt,
            "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n5\n00:00:03.000 --> 00:00:04.000\nWorld\n"
        );
    }

    #[test]
    fn does_not_strip_a_lone_numeric_cue_line_not_followed_by_a_timestamp() {
        // A cue whose text happens to be just digits should not be mistaken
        // for a cue identifier: the heuristic only strips a numeric line
        // when the very next line is a timing line.
        let srt = "1\n00:00:01,000 --> 00:00:02,000\n42\n";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.contains("42"));
    }

    #[test]
    fn handles_empty_input_without_crashing() {
        let vtt = srt_to_vtt("");
        assert_eq!(vtt, "WEBVTT\n\n");
    }

    #[test]
    fn handles_malformed_input_without_crashing() {
        let srt = "not a subtitle file\njust some garbage\n\n\n---\n";
        let vtt = srt_to_vtt(srt);
        assert!(vtt.starts_with("WEBVTT\n\n"));
        assert!(vtt.contains("not a subtitle file"));
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
    fn accepts_srt_and_vtt_file_names_case_insensitively() {
        assert!(is_subtitle_file_name("movie.srt"));
        assert!(is_subtitle_file_name("subs/en.VTT"));
        assert!(is_subtitle_file_name("Some.Show.S01E01.PT-BR.Srt"));
    }

    #[test]
    fn rejects_non_subtitle_file_names() {
        assert!(!is_subtitle_file_name("movie.mkv"));
        assert!(!is_subtitle_file_name("movie.mp4"));
        assert!(!is_subtitle_file_name("readme.txt"));
        assert!(!is_subtitle_file_name("srt")); // no extension, just contains the substring
        assert!(!is_subtitle_file_name(""));
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
