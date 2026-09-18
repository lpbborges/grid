#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/tests/fixtures/media"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

printf '1\n00:00:01,000 --> 00:00:04,000\nGrid fixture\n' > "$WORK/sub.srt"

clip() {
  local seconds="$1" subtitle_codec="$2" output="$3"
  shift 3
  ffmpeg -loglevel error -y \
    -f lavfi -i "testsrc2=size=320x180:rate=24" \
    -f lavfi -i "sine=frequency=440" \
    -i "$WORK/sub.srt" \
    -t "$seconds" -map 0:v -map 1:a -map 2:s \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 24 -b:v 150k \
    -c:a aac -b:a 48k -c:s "$subtitle_codec" \
    -map_metadata -1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact \
    "$@" "$output"
}

rm -rf "$OUT"
mkdir -p "$OUT/movie-mkv" "$OUT/movie-mp4" "$OUT/series"

clip 10 srt "$OUT/movie-mkv/Grid.Fixture.2026.1080p.mkv"
cp "$WORK/sub.srt" "$OUT/movie-mkv/Grid.Fixture.2026.1080p.en.srt"

clip 10 mov_text "$OUT/movie-mp4/Grid.Fixture.2026.1080p.mp4" -movflags +faststart
cp "$WORK/sub.srt" "$OUT/movie-mp4/Grid.Fixture.2026.1080p.en.srt"

clip 10 srt "$OUT/series/Grid.Series.S01E01.1080p.mkv"
clip 14 srt "$OUT/series/Grid.Series.S01E02.1080p.mkv"
