mod matroska;
mod mp4;

use std::collections::BTreeMap;

#[cfg(test)]
pub use matroska::fixtures as matroska_fixtures;
#[cfg(test)]
pub use mp4::fixtures as mp4_fixtures;

const INITIAL_FETCH_LEN: u64 = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Edit {
    offset: u64,
    bytes: Vec<u8>,
}

impl Edit {
    fn end(&self) -> u64 {
        self.offset + self.bytes.len() as u64
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Patch {
    edits: Vec<Edit>,
}

impl Patch {
    fn new(edits: Vec<Edit>) -> Option<Self> {
        (!edits.is_empty()).then_some(Self { edits })
    }

    pub fn overlaps(&self, offset: u64, len: usize) -> bool {
        let end = offset + len as u64;
        self.edits
            .iter()
            .any(|edit| edit.offset < end && offset < edit.end())
    }

    pub fn apply(&self, chunk: &mut [u8], chunk_offset: u64) {
        let chunk_end = chunk_offset + chunk.len() as u64;
        for edit in &self.edits {
            let start = chunk_offset.max(edit.offset);
            let end = chunk_end.min(edit.end());
            if start < end {
                let len = (end - start) as usize;
                let chunk_from = (start - chunk_offset) as usize;
                let edit_from = (start - edit.offset) as usize;
                chunk[chunk_from..chunk_from + len]
                    .copy_from_slice(&edit.bytes[edit_from..edit_from + len]);
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Fetch { offset: u64, len: u64 },
    Done(Option<Patch>),
}

#[derive(Debug, Default)]
pub struct FileView {
    len: Option<u64>,
    ranges: BTreeMap<u64, Vec<u8>>,
}

impl FileView {
    pub fn insert(&mut self, offset: u64, bytes: Vec<u8>, file_len: u64) {
        self.len = Some(file_len);
        if let Some((start, existing)) = self.ranges.range_mut(..offset).next_back() {
            if *start + existing.len() as u64 == offset {
                existing.extend(bytes);
                return;
            }
        }
        let existing = self.ranges.entry(offset).or_default();
        if bytes.len() > existing.len() {
            *existing = bytes;
        }
    }

    fn read(&self, offset: u64, len: u64) -> Option<&[u8]> {
        let (start, bytes) = self.ranges.range(..=offset).next_back()?;
        let from = usize::try_from(offset - start).ok()?;
        let to = from.checked_add(usize::try_from(len).ok()?)?;
        bytes.get(from..to)
    }

    fn prefix(&self) -> &[u8] {
        self.ranges.get(&0).map_or(&[], Vec::as_slice)
    }
}

pub fn next_step(view: &FileView) -> Step {
    let Some(file_len) = view.len else {
        return Step::Fetch {
            offset: 0,
            len: INITIAL_FETCH_LEN,
        };
    };
    let head = view.prefix();
    if matroska::is_matroska(head) {
        matroska::next_step(view, file_len)
    } else if mp4::is_mp4(head) {
        mp4::next_step(view, file_len)
    } else {
        Step::Done(None)
    }
}

#[cfg(test)]
pub fn resolve(file: &[u8]) -> (Option<Patch>, u64) {
    let mut view = FileView::default();
    let mut fetched = 0;
    loop {
        match next_step(&view) {
            Step::Done(patch) => return (patch, fetched),
            Step::Fetch { offset, len } => {
                let start = offset as usize;
                let end = (start + len as usize).min(file.len());
                let bytes = file.get(start..end).unwrap_or_default().to_vec();
                assert!(!bytes.is_empty(), "fetch past the end at {offset}");
                fetched += bytes.len() as u64;
                view.insert(offset, bytes, file.len() as u64);
            }
        }
    }
}

#[cfg(test)]
pub fn patched(file: &[u8]) -> Vec<u8> {
    let mut out = file.to_vec();
    if let (Some(patch), _) = resolve(file) {
        patch.apply(&mut out, 0);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_by_fetching_the_head_of_the_file() {
        assert_eq!(
            next_step(&FileView::default()),
            Step::Fetch {
                offset: 0,
                len: INITIAL_FETCH_LEN
            }
        );
    }

    #[test]
    fn leaves_files_that_are_neither_matroska_nor_mp4_alone() {
        let avi = [
            b"RIFF".to_vec(),
            vec![0x10, 0, 0, 0],
            b"AVI LIST".to_vec(),
            vec![0; 64],
        ]
        .concat();
        assert_eq!(resolve(&avi).0, None);
    }

    #[test]
    fn apply_overlays_only_the_bytes_covered_by_each_edit() {
        let patch = Patch {
            edits: vec![
                Edit {
                    offset: 10,
                    bytes: vec![1, 2, 3, 4],
                },
                Edit {
                    offset: 20,
                    bytes: vec![9, 9],
                },
            ],
        };
        let cases: [(u64, usize, Vec<u8>); 6] = [
            (0, 10, vec![0; 10]),
            (14, 6, vec![0; 6]),
            (8, 4, vec![0, 0, 1, 2]),
            (11, 2, vec![2, 3]),
            (12, 10, vec![3, 4, 0, 0, 0, 0, 0, 0, 9, 9]),
            (21, 3, vec![9, 0, 0]),
        ];
        for (offset, len, expected) in cases {
            let mut chunk = vec![0u8; len];
            patch.apply(&mut chunk, offset);
            assert_eq!(chunk, expected, "chunk at {offset}");
        }
    }

    #[test]
    fn overlaps_only_ranges_that_touch_an_edit() {
        let patch = Patch {
            edits: vec![Edit {
                offset: 10,
                bytes: vec![1, 2, 3, 4],
            }],
        };
        assert!(!patch.overlaps(0, 10));
        assert!(patch.overlaps(0, 11));
        assert!(patch.overlaps(13, 5));
        assert!(!patch.overlaps(14, 100));
    }
}
