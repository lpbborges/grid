use super::{Edit, FileView, Patch, Step, INITIAL_FETCH_LEN};

const EBML_HEADER_ID: u32 = 0x1A45_DFA3;
const SEGMENT_ID: u32 = 0x1853_8067;
const TRACKS_ID: u32 = 0x1654_AE6B;
const CLUSTER_ID: u32 = 0x1F43_B675;
const TRACK_ENTRY_ID: u32 = 0xAE;
const TRACK_TYPE_ID: u32 = 0x83;
const VOID_ID: u8 = 0xEC;
const SUBTITLE_TRACK_TYPE: u64 = 0x11;
const MAX_HEADER_LEN: usize = 16 * 1024 * 1024;

enum ParseError {
    Incomplete,
    Invalid,
}

type Parsed<T> = Result<T, ParseError>;

struct Element {
    id: u32,
    start: usize,
    payload_start: usize,
    size: Option<usize>,
}

impl Element {
    fn end(&self) -> Parsed<usize> {
        self.size
            .and_then(|size| self.payload_start.checked_add(size))
            .ok_or(ParseError::Invalid)
    }
}

fn be_uint(bytes: &[u8]) -> u64 {
    bytes
        .iter()
        .fold(0, |acc, byte| (acc << 8) | u64::from(*byte))
}

fn read_vint(bytes: &[u8], at: usize, max_len: u32) -> Parsed<(u64, usize)> {
    let first = *bytes.get(at).ok_or(ParseError::Incomplete)?;
    let len = first.leading_zeros() + 1;
    if len > max_len {
        return Err(ParseError::Invalid);
    }
    let len = len as usize;
    let raw = bytes.get(at..at + len).ok_or(ParseError::Incomplete)?;
    Ok((be_uint(raw), len))
}

fn read_element(bytes: &[u8], at: usize) -> Parsed<Element> {
    let (id, id_len) = read_vint(bytes, at, 4)?;
    let (raw_size, size_len) = read_vint(bytes, at + id_len, 8)?;
    let mask = (1u64 << (7 * size_len)) - 1;
    let size = match raw_size & mask {
        unknown if unknown == mask => None,
        size => Some(usize::try_from(size).map_err(|_| ParseError::Invalid)?),
    };
    Ok(Element {
        id: id as u32,
        start: at,
        payload_start: at + id_len + size_len,
        size,
    })
}

fn children(bytes: &[u8]) -> Parsed<Vec<Element>> {
    let mut elements = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        let element = read_element(bytes, at)?;
        at = element.end()?;
        elements.push(element);
    }
    if at > bytes.len() {
        return Err(ParseError::Invalid);
    }
    Ok(elements)
}

fn void_element(total_len: usize) -> Vec<u8> {
    (1..=8usize)
        .find_map(|size_len| {
            let payload_len = total_len.checked_sub(1 + size_len)?;
            let max_payload = (1usize << (7 * size_len)) - 1;
            (payload_len < max_payload).then(|| {
                let size = (payload_len as u64) | (1u64 << (7 * size_len));
                let mut out = Vec::with_capacity(total_len);
                out.push(VOID_ID);
                out.extend_from_slice(&size.to_be_bytes()[8 - size_len..]);
                out.resize(total_len, 0);
                out
            })
        })
        .expect("a void element fits any track entry length")
}

fn track_type(entry: &[u8]) -> Parsed<Option<u64>> {
    for child in children(entry)? {
        if child.id == TRACK_TYPE_ID {
            let value = &entry[child.payload_start..child.end()?];
            return Ok((value.len() <= 8).then(|| be_uint(value)));
        }
    }
    Ok(None)
}

fn void_subtitle_entries(tracks_payload: &mut [u8]) -> Parsed<usize> {
    let mut voided = 0;
    for entry in children(tracks_payload)? {
        let end = entry.end()?;
        if entry.id == TRACK_ENTRY_ID
            && track_type(&tracks_payload[entry.payload_start..end])? == Some(SUBTITLE_TRACK_TYPE)
        {
            tracks_payload[entry.start..end].copy_from_slice(&void_element(end - entry.start));
            voided += 1;
        }
    }
    Ok(voided)
}

fn find_edit(head: &[u8]) -> Parsed<Option<Edit>> {
    let ebml_header = read_element(head, 0)?;
    let segment = read_element(head, ebml_header.end()?)?;
    if segment.id != SEGMENT_ID {
        return Err(ParseError::Invalid);
    }

    let mut at = segment.payload_start;
    loop {
        let child = read_element(head, at)?;
        match child.id {
            CLUSTER_ID => return Ok(None),
            TRACKS_ID => {
                let end = child.end()?;
                let mut bytes = head
                    .get(child.start..end)
                    .ok_or(ParseError::Incomplete)?
                    .to_vec();
                let voided = void_subtitle_entries(&mut bytes[child.payload_start - child.start..])
                    .map_err(|_| ParseError::Invalid)?;
                return Ok((voided > 0).then_some(Edit {
                    offset: child.start as u64,
                    bytes,
                }));
            }
            _ => at = child.end()?,
        }
    }
}

pub(super) fn is_matroska(head: &[u8]) -> bool {
    head.starts_with(&EBML_HEADER_ID.to_be_bytes())
}

pub(super) fn next_step(view: &FileView, file_len: u64) -> Step {
    let head = view.prefix();
    let head_len = head.len() as u64;
    match find_edit(head) {
        Ok(edit) => Step::Done(edit.and_then(|edit| Patch::new(vec![edit]))),
        Err(ParseError::Incomplete) if head.len() < MAX_HEADER_LEN && head_len < file_len => {
            Step::Fetch {
                offset: head_len,
                len: head_len.max(INITIAL_FETCH_LEN).min(file_len - head_len),
            }
        }
        Err(_) => Step::Done(None),
    }
}

#[cfg(test)]
pub mod fixtures {
    fn size_vint(len: usize) -> Vec<u8> {
        let mut bytes = (len as u64).to_be_bytes().to_vec();
        bytes[0] = 0x01;
        bytes
    }

    pub fn element(id: &[u8], payload: &[u8]) -> Vec<u8> {
        [id.to_vec(), size_vint(payload.len()), payload.to_vec()].concat()
    }

    pub fn track_entry(number: u8, track_type: u8, codec: &str) -> Vec<u8> {
        element(
            &[0xAE],
            &[
                element(&[0xD7], &[number]),
                element(&[0x83], &[track_type]),
                element(&[0x86], codec.as_bytes()),
            ]
            .concat(),
        )
    }

    pub fn ebml_header() -> Vec<u8> {
        element(
            &[0x1A, 0x45, 0xDF, 0xA3],
            &element(&[0x42, 0x82], b"matroska"),
        )
    }

    pub struct TestFile {
        pub bytes: Vec<u8>,
        pub tracks_offset: usize,
        pub tracks_len: usize,
    }

    pub fn matroska_with_cluster(tracks: &[Vec<u8>], cluster_len: usize) -> TestFile {
        let info = element(
            &[0x15, 0x49, 0xA9, 0x66],
            &element(&[0x2A, 0xD7, 0xB1], &[0x0F]),
        );
        let tracks_element = element(&[0x16, 0x54, 0xAE, 0x6B], &tracks.concat());
        let cluster_payload: Vec<u8> = (0..cluster_len).map(|i| (i % 251) as u8).collect();
        let cluster = element(&[0x1F, 0x43, 0xB6, 0x75], &cluster_payload);
        let header = ebml_header();
        let tracks_offset = header.len() + 12 + info.len();
        let tracks_len = tracks_element.len();
        let segment_payload = [info, tracks_element, cluster].concat();
        TestFile {
            bytes: [header, element(&[0x18, 0x53, 0x80, 0x67], &segment_payload)].concat(),
            tracks_offset,
            tracks_len,
        }
    }

    pub fn matroska(tracks: &[Vec<u8>]) -> TestFile {
        matroska_with_cluster(tracks, 32)
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;
    use crate::media_patch::{patched, resolve};

    fn read_size(bytes: &[u8], at: usize) -> (usize, usize) {
        let first = bytes[at];
        let len = first.leading_zeros() as usize + 1;
        let mut value = usize::from(first) & ((1usize << (8 - len)) - 1);
        for byte in &bytes[at + 1..at + len] {
            value = (value << 8) | usize::from(*byte);
        }
        (value, len)
    }

    fn track_types_and_void_count(bytes: &[u8], tracks_offset: usize) -> (Vec<u8>, usize) {
        let (tracks_size, tracks_size_len) = read_size(bytes, tracks_offset + 4);
        let mut at = tracks_offset + 4 + tracks_size_len;
        let end = at + tracks_size;
        let mut types = Vec::new();
        let mut voids = 0;
        while at < end {
            let id = bytes[at];
            let (payload_len, size_len) = read_size(bytes, at + 1);
            let payload_start = at + 1 + size_len;
            let payload_end = payload_start + payload_len;
            if id == 0xAE {
                let mut child = payload_start;
                while child < payload_end {
                    let (child_len, child_size_len) = read_size(bytes, child + 1);
                    if bytes[child] == 0x83 {
                        types.push(bytes[child + 1 + child_size_len]);
                    }
                    child += 1 + child_size_len + child_len;
                }
            } else if id == VOID_ID {
                voids += 1;
            }
            at = payload_end;
        }
        assert_eq!(at, end);
        (types, voids)
    }

    #[test]
    fn voids_every_subtitle_track_entry_and_leaves_everything_else_untouched() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x02, "A_EAC3"),
            track_entry(3, 0x11, "S_TEXT/UTF8"),
            track_entry(4, 0x02, "A_EAC3"),
            track_entry(5, 0x11, "S_TEXT/UTF8"),
        ]);

        let out = patched(&file.bytes);

        let tracks_end = file.tracks_offset + file.tracks_len;
        assert_eq!(out.len(), file.bytes.len());
        assert_eq!(
            track_types_and_void_count(&out, file.tracks_offset),
            (vec![0x01, 0x02, 0x02], 2)
        );
        assert_eq!(out[..file.tracks_offset], file.bytes[..file.tracks_offset]);
        assert_eq!(out[tracks_end..], file.bytes[tracks_end..]);
    }

    #[test]
    fn patch_covers_only_the_tracks_element() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x11, "S_TEXT/UTF8"),
        ]);

        let (Some(patch), _) = resolve(&file.bytes) else {
            panic!("expected a patch");
        };

        assert_eq!(patch.edits.len(), 1);
        assert_eq!(patch.edits[0].offset, file.tracks_offset as u64);
        assert_eq!(patch.edits[0].bytes.len(), file.tracks_len);
    }

    #[test]
    fn is_not_applicable_when_there_are_no_subtitle_tracks() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x02, "A_AAC"),
        ]);
        assert_eq!(resolve(&file.bytes).0, None);
    }

    #[test]
    fn fetches_more_until_the_whole_tracks_element_is_available() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x11, "S_TEXT/UTF8"),
        ]);
        let file_len = file.bytes.len() as u64;
        let tracks_end = file.tracks_offset + file.tracks_len;
        let view_of = |cut: usize| {
            let mut view = FileView::default();
            view.insert(0, file.bytes[..cut].to_vec(), file_len);
            view
        };

        for cut in [file.tracks_offset, file.tracks_offset + 20, tracks_end - 1] {
            assert!(
                matches!(next_step(&view_of(cut), file_len), Step::Fetch { offset, .. } if offset == cut as u64),
                "cut at {cut}"
            );
        }
        assert!(matches!(
            next_step(&view_of(tracks_end), file_len),
            Step::Done(Some(_))
        ));
    }

    #[test]
    fn is_not_applicable_when_a_cluster_comes_before_the_tracks() {
        let cluster = element(&[0x1F, 0x43, 0xB6, 0x75], &[0u8; 8]);
        let tracks = element(
            &[0x16, 0x54, 0xAE, 0x6B],
            &track_entry(1, 0x11, "S_TEXT/UTF8"),
        );
        let bytes = [
            ebml_header(),
            element(&[0x18, 0x53, 0x80, 0x67], &[cluster, tracks].concat()),
        ]
        .concat();
        assert_eq!(resolve(&bytes).0, None);
    }

    #[test]
    fn handles_a_segment_with_unknown_size() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x11, "S_TEXT/UTF8"),
        ]);
        let mut bytes = file.bytes.clone();
        let segment_size_at = ebml_header().len() + 4;
        bytes[segment_size_at..segment_size_at + 8]
            .copy_from_slice(&[0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

        let out = patched(&bytes);

        assert_eq!(
            track_types_and_void_count(&out, file.tracks_offset),
            (vec![0x01], 1)
        );
    }

    #[test]
    fn replaces_entries_of_any_size_with_a_well_formed_void() {
        let empty_entry_len = track_entry(1, 0x11, "").len();
        for total in [empty_entry_len, 127, 128, 129, 130, 20_000] {
            let codec = "x".repeat(total - empty_entry_len);
            let file = matroska(&[track_entry(1, 0x11, &codec)]);
            let out = patched(&file.bytes);
            assert_eq!(
                track_types_and_void_count(&out, file.tracks_offset),
                (vec![], 1),
                "entry length {total}"
            );
        }
    }
}
