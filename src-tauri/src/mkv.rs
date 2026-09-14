const EBML_HEADER_ID: u32 = 0x1A45_DFA3;
const SEGMENT_ID: u32 = 0x1853_8067;
const TRACKS_ID: u32 = 0x1654_AE6B;
const CLUSTER_ID: u32 = 0x1F43_B675;
const TRACK_ENTRY_ID: u32 = 0xAE;
const TRACK_TYPE_ID: u32 = 0x83;
const VOID_ID: u8 = 0xEC;
const SUBTITLE_TRACK_TYPE: u64 = 0x11;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Patch {
    pub offset: u64,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PatchLookup {
    NeedMoreData,
    NotApplicable,
    Found(Patch),
}

impl Patch {
    pub fn end(&self) -> u64 {
        self.offset + self.bytes.len() as u64
    }
}

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

fn find_patch(head: &[u8]) -> Parsed<Option<Patch>> {
    if EBML_HEADER_ID
        .to_be_bytes()
        .iter()
        .zip(head)
        .any(|(a, b)| a != b)
    {
        return Err(ParseError::Invalid);
    }
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
                return Ok((voided > 0).then_some(Patch {
                    offset: child.start as u64,
                    bytes,
                }));
            }
            _ => at = child.end()?,
        }
    }
}

pub fn subtitle_track_patch(head: &[u8]) -> PatchLookup {
    match find_patch(head) {
        Ok(Some(patch)) => PatchLookup::Found(patch),
        Ok(None) | Err(ParseError::Invalid) => PatchLookup::NotApplicable,
        Err(ParseError::Incomplete) => PatchLookup::NeedMoreData,
    }
}

pub fn apply_patch(chunk: &mut [u8], chunk_offset: u64, patch: &Patch) {
    let chunk_end = chunk_offset + chunk.len() as u64;
    let start = chunk_offset.max(patch.offset);
    let end = chunk_end.min(patch.end());
    if start >= end {
        return;
    }
    let len = (end - start) as usize;
    let chunk_from = (start - chunk_offset) as usize;
    let patch_from = (start - patch.offset) as usize;
    chunk[chunk_from..chunk_from + len].copy_from_slice(&patch.bytes[patch_from..patch_from + len]);
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

    fn patched(bytes: &[u8]) -> Vec<u8> {
        let PatchLookup::Found(patch) = subtitle_track_patch(bytes) else {
            panic!("expected a patch");
        };
        let mut out = bytes.to_vec();
        apply_patch(&mut out, 0, &patch);
        out
    }

    fn read_vint(bytes: &[u8], at: usize) -> (usize, usize) {
        let first = bytes[at];
        let len = first.leading_zeros() as usize + 1;
        let mut value = usize::from(first) & ((1usize << (8 - len)) - 1);
        for byte in &bytes[at + 1..at + len] {
            value = (value << 8) | usize::from(*byte);
        }
        (value, len)
    }

    fn track_types_and_void_count(bytes: &[u8], tracks_offset: usize) -> (Vec<u8>, usize) {
        let (tracks_size, tracks_size_len) = read_vint(bytes, tracks_offset + 4);
        let mut at = tracks_offset + 4 + tracks_size_len;
        let end = at + tracks_size;
        let mut types = Vec::new();
        let mut voids = 0;
        while at < end {
            let id = bytes[at];
            let (payload_len, size_len) = read_vint(bytes, at + 1);
            let payload_start = at + 1 + size_len;
            let payload_end = payload_start + payload_len;
            if id == 0xAE {
                let mut child = payload_start;
                while child < payload_end {
                    let (child_len, child_size_len) = read_vint(bytes, child + 1);
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

        let PatchLookup::Found(patch) = subtitle_track_patch(&file.bytes) else {
            panic!("expected a patch");
        };

        assert_eq!(patch.offset, file.tracks_offset as u64);
        assert_eq!(patch.bytes.len(), file.tracks_len);
    }

    #[test]
    fn is_not_applicable_when_there_are_no_subtitle_tracks() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x02, "A_AAC"),
        ]);
        assert_eq!(
            subtitle_track_patch(&file.bytes),
            PatchLookup::NotApplicable
        );
    }

    #[test]
    fn is_not_applicable_for_non_matroska_data() {
        let mp4_head = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41";
        assert_eq!(subtitle_track_patch(mp4_head), PatchLookup::NotApplicable);
    }

    #[test]
    fn needs_more_data_until_the_whole_tracks_element_is_available() {
        let file = matroska(&[
            track_entry(1, 0x01, "V_MPEG4/ISO/AVC"),
            track_entry(2, 0x11, "S_TEXT/UTF8"),
        ]);
        let tracks_end = file.tracks_offset + file.tracks_len;
        for cut in [
            0,
            3,
            file.tracks_offset,
            file.tracks_offset + 20,
            tracks_end - 1,
        ] {
            assert_eq!(
                subtitle_track_patch(&file.bytes[..cut]),
                PatchLookup::NeedMoreData,
                "cut at {cut}"
            );
        }
        assert!(matches!(
            subtitle_track_patch(&file.bytes[..tracks_end]),
            PatchLookup::Found(_)
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
        assert_eq!(subtitle_track_patch(&bytes), PatchLookup::NotApplicable);
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

    #[test]
    fn apply_patch_overlays_only_the_overlapping_bytes() {
        let patch = Patch {
            offset: 10,
            bytes: vec![1, 2, 3, 4],
        };
        let cases: [(u64, usize, Vec<u8>); 6] = [
            (0, 10, vec![0; 10]),
            (14, 4, vec![0; 4]),
            (8, 4, vec![0, 0, 1, 2]),
            (11, 2, vec![2, 3]),
            (12, 6, vec![3, 4, 0, 0, 0, 0]),
            (5, 12, vec![0, 0, 0, 0, 0, 1, 2, 3, 4, 0, 0, 0]),
        ];
        for (offset, len, expected) in cases {
            let mut chunk = vec![0u8; len];
            apply_patch(&mut chunk, offset, &patch);
            assert_eq!(chunk, expected, "chunk at {offset}");
        }
    }
}
