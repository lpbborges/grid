# Spike: mpv `--wid` overlay on Windows

**Result: pass.** mpv reparents into Grid's top-level window via `--wid`, the Svelte
UI composites on top of it, and the overlay keeps receiving clicks.

First measured 2026-09-20 at `5d4acd7`, then re-measured 2026-09-21 at `121a461`
with mpv actually playing. The first run only ever showed a still frame, so it
could not rule out a presenting swapchain behaving differently from a static one.
It does now: the video plays continuously under the UI and mpv stays at the
bottom of the child z-order the whole time.

## The question

Does the Svelte UI render on top of the mpv video surface inside a single Tauri
window, and keep receiving clicks? Nothing else — not seeking, track switching,
startup time or streaming. A local file was used so a negative result could not
be blamed on rqbit, the stream proxy or the Matroska header patch.

## The five checks

| Check | Question                       | Result | Evidence                                                                                            |
| ----- | ------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| P1    | Video plays in the upper area  | Pass   | 4K HEVC plays continuously; logo, search box and hint text draw over it                             |
| P2    | Translucent bar over the video | Pass   | Colour bars show through the 70% surface bar and through the path input                             |
| P3    | Clicks reach the UI            | Pass   | Counter 13 → 17 after exactly four clicks on the button sitting over the video                      |
| P4    | Video follows the client area  | Pass   | Grid 1296x809 → mpv child 1280x800; resized to 1000x640 → child 984x631; restored → 1280x800        |
| P5    | mpv dies with Grid             | Pass   | One mpv (pid 5564) before; `TerminateProcess` on `grid.exe` (pid 5192); zero mpv processes 6s later |

Status line, verbatim:

```
parent 0x6027e; 2 track(s); video pushed behind the UI. children: [TAURI_DRAG_RESIZE_BORDERS (0x103b4), WRY_WEBVIEW (0x60234), Chrome_WidgetWin_0 (0x30080), Chrome_WidgetWin_1 (0x103a2), Chrome_RenderWidgetHostHWND (0x103a4), Intermediate D3D Window (0x103ac), mpv (0x50414)]
```

mpv created class `mpv` as a direct child of Grid's top-level window, sibling to
WebView2's `Chrome_WidgetWin_*`. `classify` matched both, so `plan_z_order`
returned `PushVideoBehind` rather than either missing-window case.

`EnumChildWindows` walks children from the top of the z-order down, and mpv came
last on every probe:

```
TAURI_DRAG_RESIZE_BORDERS > WRY_WEBVIEW > Chrome_WidgetWin_0 > Chrome_WidgetWin_1
  > Chrome_RenderWidgetHostHWND > Intermediate D3D Window > mpv
```

The single `SetWindowPos(HWND_BOTTOM)` at start is enough; nothing re-raises mpv
as it presents.

P5 confirms the Job Object in `engine_process::spawn_tied_to_app` holds for an
mpv started with `--wid`: no orphan survived.

## What blocked it first

The spike page punches the layout transparent with `:global(body > div)`. But
`src/app.html` wraps the body in `<div style="display: contents">`, so the
layout's opaque `bg-dark` div (`src/routes/+layout.svelte:9`) is `body > div > div`
— one level deeper, and never punched through.

The first run therefore produced a textbook false negative: a correct status line
(`video pushed behind the UI`) over a flat background at exactly `rgb(15,15,21)`,
which is `--bg-dark: #0f0f15`.

The two causes were separated by raising the mpv child above the webview with
`SetWindowPos(HWND_TOP)`: the video was there the whole time, hidden behind the
app's own CSS background rather than behind an opaque webview. The fix is the
accompanying commit.

## The machine

A QEMU VM — deliberately the weakest plausible configuration, which makes the
pass stronger rather than weaker.

```
System Manufacturer: QEMU
       System Model: Standard PC (Q35 + ICH9, 2009)
          Processor: AMD Ryzen 7 8845HS w/ Radeon 780M Graphics (2 CPUs), ~3.8GHz
             Memory: 4096MB RAM

Card name: Microsoft Remote Display Adapter
   Feature Levels: 12_1,12_0,11_1,11_0,10_1,10_0,9_3,9_2,9_1,1_0_CORE
     Driver Model: WDDM 3.2
       D3D Status: Enabled

Card name: Red Hat VirtIO GPU DOD controller
       Chip type: QEMU VIRTIO GPU
   Feature Levels: 12_1,12_0,11_1,11_0,10_1,10_0,9_3,9_2,9_1,1_0_CORE
     Driver Model: WDDM 1.3
       D3D Status: Enabled
```

Windows 11 26200's `dxdiag /t` no longer emits a "Direct3D Acceleration" line; it
reports `D3D Status` per adapter instead. The virtio GPU is display-only (`DOD`),
`Hardware Scheduling` is off and `DXVA-HD` is unsupported, so feature level 12_1
is served in software. `GRID_SPIKE_SOFTWARE_GPU=1` was **not** needed — the run
used the default `--vo=gpu --gpu-api=d3d11 --hwdec=auto-safe` path with a 4K HEVC
file.

## Running it

Both defects below were found by the first run and fixed in `121a461`; the spike
now runs as committed. They are recorded because the workarounds appear in the
first run's notes.

1. `npm run spike:embed` failed outright before that commit:

   ```
   error: invalid value 'tauri.spike.conf.json' for '--config <CONFIG>': failed to read configuration file tauri.spike.conf.json: The system cannot find the file specified. (os error 2)
   ```

   The path was resolved against the repo root, but the file lives in
   `src-tauri/`. The script now passes `src-tauri/tauri.spike.conf.json`.

2. Nothing navigated to `/spike` — decorations are off, so there is no address
   bar. `tauri.spike.conf.json` now sets the window's `url` to `spike`.

A third, still open: the clip is 120s and `launch_args` sets `--keep-open=no`, so
mpv exits at EOF. Any measurement pass has to finish inside that window, or
re-press EMBED MPV. A run that outlasts the clip sees no `mpv` child and looks
exactly like a reparenting failure.

No local media was available, so the test clip was generated with the mpv sidecar
itself — real codec path, synthetic content:

```
mpv "av://lavfi:testsrc2=size=3840x2160:rate=24[out0];sine=frequency=440:sample_rate=48000[out1]" \
  --length=120 --o=spike-4k-hevc-eac3.mkv --of=matroska \
  --ovc=libx265 --ovcopts=preset=ultrafast,crf=30 --oac=eac3 --no-config
```

## What this does not answer

- **The content is synthetic.** `testsrc2` plus a sine tone, encoded to HEVC and
  E-AC3. The codecs match the motivating case; the content does not.
- **Hardware decoding never engaged.** The virtio GPU is display-only, so
  `--hwdec=auto-safe` fell back to software for the whole run. That the
  arrangement composites is established; that a real GPU's decode path and
  presentation behave the same under the webview is not. This is the one check
  worth repeating on physical hardware, and it is about performance, not
  feasibility.
- **Nothing was streamed.** A local file was used on purpose. Seeking into an
  undownloaded region through `stream_proxy.rs` is untouched here and stays a
  risk the real implementation carries over from the existing plan.
- **EOF was not exercised as a product case.** `--keep-open=no` makes mpv exit at
  the end of the file, so its child window disappears while the Svelte UI stays
  up. Harmless in a spike; in the real player that transition has to be handled
  on the `native-player-ended` event rather than left to leave a hole in the
  window.

## Conclusion

D2 is not blocked by Tauri's window management. `--wid` keeps mpv a separate
process over JSON IPC, so D7 is untouched and Grid's licence does not change.
The only thing that broke the arrangement was a CSS selector.
