const fs = require('fs');

let code = fs.readFileSync('src/lib/api/subtitles.test.ts', 'utf-8');

const newTest = `
    it('returns formatted subtitles on success', async () => {`;

const testToAdd = `
    it('fetches correct URL for series when season and episode are provided', async () => {
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ subtitles: [] })
      });
      await getExternalSubtitles('tt123456', 1, 2);
      expect(fetch).toHaveBeenCalledWith('https://opensubtitles-v3.strem.io/subtitles/series/tt123456:1:2.json');
    });

    it('returns formatted subtitles on success', async () => {`;

code = code.replace(newTest, testToAdd);
fs.writeFileSync('src/lib/api/subtitles.test.ts', code);
