import { describe, it, expect } from 'vitest';
import { rankStreamOptions, scoreStreamOption, type StreamRankingInput } from './ranking';

describe('scoreStreamOption', () => {
  it('rewards an exact quality match over a substring match on unrelated quality', () => {
    // Same requested quality ('1080p'), but option A has it as its actual
    // quality while option B merely mentions "1080p" inside unrelated text
    // and has a different real quality ('720p'). Exact match must win.
    const exact: StreamRankingInput = { quality: '1080p', text: 'release 1080p web', seeds: 0 };
    const substringOnly: StreamRankingInput = {
      quality: '720p',
      text: 'release mentions 1080p somewhere',
      seeds: 0
    };

    const exactScore = scoreStreamOption(exact, { quality: '1080p', audioPreference: 'original' });
    const substringScore = scoreStreamOption(substringOnly, {
      quality: '1080p',
      audioPreference: 'original'
    });

    expect(exactScore).toBeGreaterThan(substringScore);
  });

  it('detects the dubbed-audio heuristic via a literal "(pt)" marker in lower-cased text', () => {
    // Regression test for the case-sensitivity bug: `t.type` used to be
    // compared uppercase against a lowercase literal and could never match.
    // The shared function must be given already-lower-cased text and detect
    // "(pt)" correctly.
    const dubbed: StreamRankingInput = { quality: '1080p', text: 'movie release (pt)', seeds: 0 };

    const score = scoreStreamOption(dubbed, { quality: '1080p', audioPreference: 'pt' });
    const scoreWithoutMarker = scoreStreamOption(
      { quality: '1080p', text: 'movie release', seeds: 0 },
      { quality: '1080p', audioPreference: 'pt' }
    );

    expect(score).toBeGreaterThan(scoreWithoutMarker);
  });

  it('distinguishes dubbed-only releases from dual-audio releases', () => {
    const dubbedOnly: StreamRankingInput = { quality: '1080p', text: 'dublado 1080p', seeds: 0 };
    const dualAudio: StreamRankingInput = {
      quality: '1080p',
      text: 'dual audio 1080p',
      seeds: 0
    };

    // Wanting original audio should penalize dubbed-only but not dual-audio.
    const dubbedOnlyOriginal = scoreStreamOption(dubbedOnly, {
      quality: '1080p',
      audioPreference: 'original'
    });
    const dualAudioOriginal = scoreStreamOption(dualAudio, {
      quality: '1080p',
      audioPreference: 'original'
    });

    expect(dualAudioOriginal).toBeGreaterThan(dubbedOnlyOriginal);
  });

  it('penalizes dubbed-only releases when the user wants original audio', () => {
    const dubbedOnly: StreamRankingInput = { quality: '1080p', text: 'dublado 1080p', seeds: 0 };
    const neutral: StreamRankingInput = { quality: '1080p', text: 'plain release 1080p', seeds: 0 };

    const dubbedScore = scoreStreamOption(dubbedOnly, {
      quality: '1080p',
      audioPreference: 'original'
    });
    const neutralScore = scoreStreamOption(neutral, {
      quality: '1080p',
      audioPreference: 'original'
    });

    expect(dubbedScore).toBeLessThan(neutralScore);
  });

  it('uses seed count as a tiebreaker between otherwise identical options', () => {
    const lowSeeds: StreamRankingInput = { quality: '1080p', text: 'plain release', seeds: 5 };
    const highSeeds: StreamRankingInput = { quality: '1080p', text: 'plain release', seeds: 50 };

    const lowScore = scoreStreamOption(lowSeeds, { quality: '1080p', audioPreference: 'original' });
    const highScore = scoreStreamOption(highSeeds, {
      quality: '1080p',
      audioPreference: 'original'
    });

    expect(highScore).toBeGreaterThan(lowScore);
  });
});

describe('rankStreamOptions', () => {
  it('sorts the original options best-first using the mapped ranking input', () => {
    interface Option {
      id: string;
      quality: string;
      text: string;
      seeds: number;
    }

    const options: Option[] = [
      { id: 'low-seeds', quality: '1080p', text: 'plain release', seeds: 1 },
      { id: 'high-seeds', quality: '1080p', text: 'plain release', seeds: 100 },
      { id: 'wrong-quality', quality: '720p', text: 'plain release', seeds: 0 }
    ];

    const ranked = rankStreamOptions(
      options,
      (opt) => ({ quality: opt.quality, text: opt.text, seeds: opt.seeds }),
      { quality: '1080p', audioPreference: 'original' }
    );

    expect(ranked.map((o) => o.id)).toEqual(['high-seeds', 'low-seeds', 'wrong-quality']);
  });

  it('does not mutate the input array', () => {
    const options = [
      { quality: '1080p', text: 'a', seeds: 1 },
      { quality: '720p', text: 'b', seeds: 2 }
    ];
    const original = [...options];

    rankStreamOptions(options, (o) => o, { quality: '1080p', audioPreference: 'original' });

    expect(options).toEqual(original);
  });
});
