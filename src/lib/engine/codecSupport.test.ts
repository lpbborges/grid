import { describe, it, expect } from 'vitest';
import { describeMediaError } from './codecSupport';

describe('describeMediaError', () => {
  it('explains a missing decoder instead of blaming the file', () => {
    // MediaError 4 on Linux almost always means the libav plugins are absent,
    // not that the file is broken. "Could not decode" sends the user hunting
    // for another release forever.
    expect(describeMediaError(4)).toContain('componentes de vídeo');
  });

  it('reports a decode failure for a codec the system cannot handle', () => {
    expect(describeMediaError(3)).toContain('decodificar');
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(describeMediaError(99)).toBe('Não foi possível reproduzir este vídeo.');
  });

  it('keeps the abort and network cases distinct from a codec problem', () => {
    // Blaming missing codecs for a network drop would send the user to install
    // packages that were never the problem.
    expect(describeMediaError(1)).not.toContain('componentes de vídeo');
    expect(describeMediaError(2)).toContain('rede');
  });
});
