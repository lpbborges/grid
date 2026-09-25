import { $, browser, expect } from '@wdio/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACTS } from '../support/driver.ts';
import { MKV_MOVIE } from '../support/catalog.ts';
import { openTitle } from '../specs/helpers.ts';

// The MKV fixture is a colour-bar test pattern. If libmpv draws under the
// transparent webview, the middle row of the screen contains several fully
// saturated bars; if the surface is missing, covered by an opaque layer, or
// black, it contains none. WebDriver screenshots only see the webview, so this
// reads the screen itself: the X server's framebuffer with ImageMagick's
// `import` on Linux, the desktop through screen-row.ps1 on Windows (where the
// GPU-less runner draws through D3D11's WARP software rasteriser).

type Rgb = [number, number, number];

const IS_WINDOWS = process.platform === 'win32';
const SCREEN_ROW_PS1 = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screen-row.ps1');

function powershell(...args: string[]): string {
  return execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCREEN_ROW_PS1, ...args],
    { encoding: 'utf8' }
  );
}

/** One row of screen pixels through the middle of Grid's window. */
function screenRow(height: number, width: number): Rgb[] {
  const text = IS_WINDOWS
    ? powershell()
    : execFileSync(
        'import',
        [
          '-window',
          'root',
          '-depth',
          '8',
          '-crop',
          `${width}x1+0+${Math.floor(height / 2)}`,
          '+repage',
          'txt:-'
        ],
        { encoding: 'utf8' }
      );
  return text.split('\n').flatMap((line) => {
    const hex = /#([0-9A-F]{6})\b/i.exec(line)?.[1];
    if (!hex) return [];
    return [[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb];
  });
}

function barColour([r, g, b]: Rgb): string | null {
  const on = (v: number) => v > 180;
  const off = (v: number) => v < 80;
  if (on(r) && off(g) && off(b)) return 'red';
  if (off(r) && on(g) && off(b)) return 'green';
  if (off(r) && off(g) && on(b)) return 'blue';
  if (on(r) && on(g) && off(b)) return 'yellow';
  if (on(r) && off(g) && on(b)) return 'magenta';
  if (off(r) && on(g) && on(b)) return 'cyan';
  return null;
}

function saveScreen(file: string): void {
  if (IS_WINDOWS) powershell('-Png', file);
  else execFileSync('import', ['-window', 'root', file]);
}

describe('Native render', () => {
  it('draws the video beneath the webview', async () => {
    await openTitle('movie', MKV_MOVIE.id);
    const play = await $('button*=Reproduzir');
    await play.waitForClickable({ timeout: 30000 });
    await play.click();
    await $('[data-testid="native-player-surface"]').waitForDisplayed({ timeout: 90000 });

    // The fixture lasts 10 s. On a busy runner most of that can pass before the
    // first frame, and once it ends the player closes, so sampling a playing
    // clip raced its length. Pause instead: mpv keeps the frame on screen, and
    // a failure capture then shows the real state.
    //
    // Not on the very first frame, though: with software GL mpv can drop it
    // (late against the audio clock), and pausing then leaves nothing shown -
    // CI logged pause=yes, time-pos=0, frame-drop=1 on a black screen. Once the
    // clock has moved, a frame has been displayed.
    await $('[data-testid="native-loading"]').waitForExist({ reverse: true, timeout: 60000 });
    await browser.waitUntil(
      async () =>
        Number(await $('[aria-label="Buscar posição"]').getAttribute('aria-valuenow')) >= 1,
      { timeout: 30000, timeoutMsg: 'playback never advanced past the first second' }
    );
    await browser.execute(() => {
      (document.querySelector('[aria-label="Pausar"]') as HTMLElement | null)?.click();
    });
    await $('[aria-label="Pausar"]').waitForExist({ reverse: true, timeout: 10000 });

    const { width, height } = await browser.getWindowSize();
    let seen = new Set<string>();
    try {
      await browser.waitUntil(
        async () => {
          seen = new Set(
            screenRow(height, width)
              .map(barColour)
              .filter((c): c is string => c !== null)
          );
          return seen.size >= 3;
        },
        {
          timeout: 60000,
          interval: 1000,
          timeoutMsg: 'no colour bars on screen: the video is not drawn'
        }
      );
    } catch (error) {
      // WebDriver's own screenshot only sees the webview, never mpv: keep what
      // the screen actually showed, so a failure can be told apart from a
      // capture or geometry problem.
      saveScreen(path.join(ARTIFACTS, 'render-smoke-screen.png'));
      throw error;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
