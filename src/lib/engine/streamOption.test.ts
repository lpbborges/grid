import { describe, it, expect } from 'vitest';
import { qualityOf, streamOption } from './streamOption';

describe('qualityOf', () => {
  it('reads the resolution out of the stream name', () => {
    expect(qualityOf('Torrentio\n1080p')).toBe('1080p');
    expect(qualityOf('Torrentio\n4K HDR')).toBe('4k');
    expect(qualityOf('Torrentio\n720P')).toBe('720p');
  });

  it('is unknown when the name carries none', () => {
    expect(qualityOf('Torrentio')).toBe('unknown');
    expect(qualityOf(undefined)).toBe('unknown');
  });
});

describe('streamOption', () => {
  const stream = {
    name: 'Torrentio\n1080p',
    title: 'Movie.2024.1080p\n👤 42 💾 2 GB',
    infoHash: 'a'.repeat(40),
    fileIdx: 3
  };

  it('describes a stream as a playable option', () => {
    expect(streamOption(stream)).toEqual({
      hash: 'a'.repeat(40),
      quality: '1080p',
      type: 'Torrentio',
      seeds: 42,
      rawStream: stream
    });
  });

  it('marks Portuguese and dual-audio releases', () => {
    expect(streamOption({ ...stream, title: 'Filme Dublado 👤 1' }).type).toBe('Torrentio (PT)');
    expect(streamOption({ ...stream, title: 'Filme PT-BR' }).type).toBe('Torrentio (PT)');
    expect(streamOption({ ...stream, title: 'Filme 🇧🇷' }).type).toBe('Torrentio (PT)');
    expect(streamOption({ ...stream, title: 'Movie DUAL audio' }).type).toBe('Torrentio (Dual)');
  });

  it('has an empty hash for a stream without one', () => {
    expect(streamOption({ name: 'Torrentio' }).hash).toBe('');
  });
});
