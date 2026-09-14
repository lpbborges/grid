use super::{Edit, FileView, Patch, Step, INITIAL_FETCH_LEN};

const TOP_LEVEL_TYPES: [&[u8; 4]; 7] = [
    b"ftyp", b"moov", b"mdat", b"free", b"skip", b"wide", b"pnot",
];
const TEXT_HANDLERS: [&[u8; 4]; 4] = [b"sbtl", b"text", b"subt", b"clcp"];
const MAX_MOOV_LEN: u64 = 64 * 1024 * 1024;
const MAX_HEADER_LEN: u64 = 16;

struct Header {
    kind: [u8; 4],
    header_len: u64,
    size: Option<u64>,
}

fn parse_header(bytes: &[u8]) -> Option<Header> {
    let size = u64::from(u32::from_be_bytes(bytes.get(0..4)?.try_into().ok()?));
    let kind = bytes.get(4..8)?.try_into().ok()?;
    match size {
        0 => Some(Header {
            kind,
            header_len: 8,
            size: None,
        }),
        1 => {
            let size = u64::from_be_bytes(bytes.get(8..16)?.try_into().ok()?);
            (size >= 16).then_some(Header {
                kind,
                header_len: 16,
                size: Some(size),
            })
        }
        size if size >= 8 => Some(Header {
            kind,
            header_len: 8,
            size: Some(size),
        }),
        _ => None,
    }
}

fn child_atoms(payload: &[u8]) -> Vec<(usize, [u8; 4], &[u8])> {
    let mut atoms = Vec::new();
    let mut at = 0;
    while let Some(header) = payload.get(at..).and_then(parse_header) {
        let remaining = payload.len() - at;
        let size = header
            .size
            .map_or(Some(remaining), |size| usize::try_from(size).ok());
        let Some(end) = size.filter(|&size| size <= remaining).map(|size| at + size) else {
            break;
        };
        atoms.push((
            at,
            header.kind,
            &payload[at + header.header_len as usize..end],
        ));
        at = end;
    }
    atoms
}

fn child<'a>(payload: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
    child_atoms(payload)
        .into_iter()
        .find(|(_, child_kind, _)| child_kind == kind)
        .map(|(_, _, body)| body)
}

fn is_text_track(trak: &[u8]) -> bool {
    child(trak, b"mdia")
        .and_then(|mdia| child(mdia, b"hdlr"))
        .and_then(|hdlr| hdlr.get(8..12))
        .is_some_and(|handler| TEXT_HANDLERS.iter().any(|text| text.as_slice() == handler))
}

fn text_track_edits(moov: &[u8], moov_offset: u64) -> Vec<Edit> {
    let Some(header) = parse_header(moov) else {
        return Vec::new();
    };
    let body_start = header.header_len as usize;
    child_atoms(&moov[body_start..])
        .into_iter()
        .filter(|(_, kind, body)| kind == b"trak" && is_text_track(body))
        .map(|(at, _, _)| Edit {
            offset: moov_offset + (body_start + at) as u64 + 4,
            bytes: b"free".to_vec(),
        })
        .collect()
}

pub(super) fn is_mp4(head: &[u8]) -> bool {
    head.get(4..8)
        .is_some_and(|kind| TOP_LEVEL_TYPES.iter().any(|known| known.as_slice() == kind))
}

pub(super) fn next_step(view: &FileView, file_len: u64) -> Step {
    let mut offset = 0u64;
    while offset + 8 <= file_len {
        let remaining = file_len - offset;
        let Some(bytes) = view.read(offset, MAX_HEADER_LEN.min(remaining)) else {
            return Step::Fetch {
                offset,
                len: INITIAL_FETCH_LEN.min(remaining),
            };
        };
        let Some(header) = parse_header(bytes).filter(|header| {
            header
                .kind
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || *byte == b' ')
        }) else {
            return Step::Done(None);
        };
        let size = header.size.unwrap_or(remaining);
        if &header.kind == b"moov" {
            if size > MAX_MOOV_LEN || size > remaining {
                return Step::Done(None);
            }
            return match view.read(offset, size) {
                Some(moov) => Step::Done(Patch::new(text_track_edits(moov, offset))),
                None => Step::Fetch { offset, len: size },
            };
        }
        offset += size;
    }
    Step::Done(None)
}

#[cfg(test)]
pub mod fixtures {
    pub fn atom(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        [
            &((payload.len() + 8) as u32).to_be_bytes()[..],
            &kind[..],
            payload,
        ]
        .concat()
    }

    pub fn large_atom(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        [
            &1u32.to_be_bytes()[..],
            &kind[..],
            &((payload.len() + 16) as u64).to_be_bytes()[..],
            payload,
        ]
        .concat()
    }

    pub fn trak(handler: &[u8; 4]) -> Vec<u8> {
        let hdlr = atom(
            b"hdlr",
            &[
                &[0u8; 8][..],
                &handler[..],
                &[0u8; 12][..],
                &b"Handler\0"[..],
            ]
            .concat(),
        );
        let mdia = atom(b"mdia", &[atom(b"mdhd", &[0u8; 24]), hdlr].concat());
        atom(b"trak", &[atom(b"tkhd", &[0u8; 84]), mdia].concat())
    }

    pub struct TestMp4 {
        pub bytes: Vec<u8>,
        pub trak_offsets: Vec<usize>,
    }

    pub fn mp4_with_mdat(traks: &[Vec<u8>], mdat: Vec<u8>, moov_at_end: bool) -> TestMp4 {
        let ftyp = atom(b"ftyp", b"isom\0\0\x02\0isomavc1");
        let mvhd = atom(b"mvhd", &[0u8; 100]);
        let moov = atom(b"moov", &[mvhd.clone(), traks.concat()].concat());
        let moov_offset = ftyp.len() + if moov_at_end { mdat.len() } else { 0 };
        let mut at = moov_offset + 8 + mvhd.len();
        let trak_offsets = traks
            .iter()
            .map(|trak| {
                let offset = at;
                at += trak.len();
                offset
            })
            .collect();
        let bytes = if moov_at_end {
            [ftyp, mdat, moov].concat()
        } else {
            [ftyp, moov, mdat].concat()
        };
        TestMp4 {
            bytes,
            trak_offsets,
        }
    }

    pub fn mp4(traks: &[Vec<u8>], moov_at_end: bool, mdat_len: usize) -> TestMp4 {
        let payload: Vec<u8> = (0..mdat_len).map(|i| (i % 253) as u8).collect();
        mp4_with_mdat(traks, atom(b"mdat", &payload), moov_at_end)
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use crate::media_patch::{patched, resolve};

    fn with_freed(file: &TestMp4, indexes: &[usize]) -> Vec<u8> {
        let mut bytes = file.bytes.clone();
        for &index in indexes {
            let at = file.trak_offsets[index] + 4;
            bytes[at..at + 4].copy_from_slice(b"free");
        }
        bytes
    }

    #[test]
    fn frees_every_text_track_and_keeps_video_and_audio() {
        let file = mp4(
            &[
                trak(b"vide"),
                trak(b"soun"),
                trak(b"sbtl"),
                trak(b"text"),
                trak(b"subt"),
                trak(b"clcp"),
            ],
            false,
            1_000,
        );
        assert_eq!(patched(&file.bytes), with_freed(&file, &[2, 3, 4, 5]));
    }

    #[test]
    fn reads_only_atom_headers_and_the_moov_when_it_follows_a_large_mdat() {
        let file = mp4(&[trak(b"vide"), trak(b"sbtl")], true, 5_000_000);

        let (patch, fetched) = resolve(&file.bytes);

        assert!(patch.is_some());
        assert!(fetched < 200_000, "fetched {fetched} bytes");
        assert_eq!(patched(&file.bytes), with_freed(&file, &[1]));
    }

    #[test]
    fn leaves_files_without_text_tracks_alone() {
        let file = mp4(&[trak(b"vide"), trak(b"soun")], true, 100_000);
        assert_eq!(resolve(&file.bytes).0, None);
    }

    #[test]
    fn follows_64_bit_atom_sizes() {
        let file = mp4_with_mdat(
            &[trak(b"vide"), trak(b"sbtl")],
            large_atom(b"mdat", &[7u8; 100_000]),
            true,
        );
        assert_eq!(patched(&file.bytes), with_freed(&file, &[1]));
    }

    #[test]
    fn gives_up_on_malformed_or_oversized_atoms() {
        let ftyp = atom(b"ftyp", b"isom\0\0\x02\0isomavc1");
        let too_small = [
            ftyp.clone(),
            4u32.to_be_bytes().to_vec(),
            b"free".to_vec(),
            vec![0; 64],
        ]
        .concat();
        let garbage = [
            ftyp.clone(),
            vec![0x7f, 0x13, 0x00, 0x99, 0xff, 0xfe, 0x01, 0x02],
            vec![0; 64],
        ]
        .concat();
        let oversized_moov = [
            ftyp,
            u32::MAX.to_be_bytes().to_vec(),
            b"moov".to_vec(),
            vec![0; 64],
        ]
        .concat();
        for bytes in [too_small, garbage, oversized_moov] {
            assert_eq!(resolve(&bytes).0, None);
        }
    }
}
