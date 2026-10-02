import { describe, it, expect } from 'vitest';
import { isLowQuality } from './streamQuality';

const stream = (title: string, name = 'Torrentio\n1080p') => ({ title, name });

describe('isLowQuality', () => {
  it.each([
    'Dune.Part.Two.2024.HDCAM.x264-NoGroup\n👤 120 💾 1.4 GB ⚙️ 1337x',
    'Dune Part Two 2024 CAMRip XviD\n👤 12',
    'Dune.Part.Two.2024.CAM.x264',
    'Dune.Part.Two.2024.HD-CAM.x264',
    'Dune.Part.Two.2024.TS.x264-GRP',
    'Dune.Part.Two.2024.HDTS.x264-GRP',
    'Dune.Part.Two.2024.HQ.HDTS.x264',
    'Dune.Part.Two.2024.TELESYNC.x264',
    'Dune Part Two 2024 Telesync 720p',
    'Dune.Part.Two.2024.TC.x264',
    'Dune.Part.Two.2024.HDTC.x264',
    'Dune.Part.Two.2024.TELECINE.x264',
    'Dune.Part.Two.2024.SCR.x264',
    'Dune.Part.Two.2024.SCREENER.x264',
    'Dune.Part.Two.2024.DVDSCR.XviD',
    'Dune.Part.Two.2024.R5.XviD',
    'Dune.Part.Two.2024.WORKPRINT.x264',
    'Dune.Part.Two.2024.3D.HSBS.1080p',
    'Dune.Part.Two.2024.SBS.1080p',
    'Dune.Part.Two.2024.1080p.HSBS.x264',
    'dune_part_two_2024_hdcam_x264'
  ])('rejects %j', (title) => {
    expect(isLowQuality(stream(title))).toBe(true);
  });

  it.each([
    'Dune.Part.Two.2024.1080p.BluRay.x264-GRP\n👤 80 💾 8 GB ⚙️ RARBG',
    'Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.HDR.x265',
    'Dune.Part.Two.2024.WEBRip.x264',
    'Dune.Part.Two.2024.HDRip.XviD',
    'Dune.Part.Two.2024.REMUX.HEVC',
    'Ghosts.2021.S01E01.1080p.WEB-DL',
    'Scrubs.S02E05.720p.HDTV',
    'Tick.Tick.Boom.2021.1080p.NF.WEB-DL',
    'Tcl.Documentary.2020.720p',
    'Cast.Away.2000.1080p.BluRay',
    'Camera.Obscura.2017.1080p.WEB-DL',
    'Cam.2018.1080p.WEBRip.x264',
    'The.Ts.Mystery.2019.1080p.BluRay'
  ])('keeps %j', (title) => {
    expect(isLowQuality(stream(title))).toBe(false);
  });

  it('only reads the release tags, so a film called Cam is not rejected for its title', () => {
    expect(isLowQuality(stream('Cam.2018.1080p.WEBRip.x264-GRP'))).toBe(false);
    expect(isLowQuality(stream('Cam.2018.CAMRip.x264-GRP'))).toBe(true);
  });

  it('reads the tags after the season and episode of a series release', () => {
    expect(isLowQuality(stream('Ts.Show.S01E02.1080p.WEB-DL'))).toBe(false);
    expect(isLowQuality(stream('Show.S01E02.HDTS.x264'))).toBe(true);
  });

  it('looks at the stream name as well as the title', () => {
    expect(isLowQuality({ name: 'Torrentio\nCAM', title: 'Dune.2024' })).toBe(true);
    expect(isLowQuality({ name: 'Torrentio\nscr', title: undefined })).toBe(true);
  });

  it('keeps a stream that has no text to judge by', () => {
    expect(isLowQuality({})).toBe(false);
  });
});
