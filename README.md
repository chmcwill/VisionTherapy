# Color Cue Therapy Tool

Small static web app for color-cue speech exercises. Users select colors, frequency, duration, and an optional seed, then run a spoken cue session in the browser.

## Features

- Client-side only (HTML/CSS/JavaScript, no backend)
- Drag-and-drop color bank with per-color option zones (`1` to `4`)
- Color cue playback using browser speech synthesis
- Accent/voice picker (based on available browser voices)
- Deterministic seeded randomness (when `seed` is set)
- URL-based session sharing
- Cloudflare Pages friendly static deployment

## Run Locally

1. From this project directory, run:

```bash
python -m http.server 8000
```

2. Open:

```text
http://localhost:8000
```

## Run Tests

After starting the local server, open:

```text
http://localhost:8000/tests.html
```

The page runs the browser test suite and prints pass/fail results.

## Deploy To Cloudflare Pages

Use static hosting with no build:

- Framework preset: `None`
- Build command: `None`
- Output directory: `/`

Upload/connect this repo as-is.

## Query Parameters

Supported URL params:

- `colors`: comma-separated list of colors
- `options`: per-color option counts as `color:count` pairs (for selected colors)
- `hz`: cue frequency in Hz (`0.25` to `1.5`)
- `seconds`: session duration in seconds (`10` to `60`)
- `seed`: optional deterministic seed
- `accent`: optional voice key from the voice picker (omitted when using auto)

Example:

```text
/?colors=red,blue,yellow,green&options=red:4,blue:4,yellow:3,green:3&hz=1&seconds=30&seed=myseed123
```

### Option Count Rules

- `1`: color only (`red`)
- `2`: `left`, `right`
- `3`: `left`, `middle`, `right`
- `4`: `far left`, `left`, `right`, `far right`

## Seeded Randomness

- If `seed` is empty, cue selection uses `Math.random()`.
- If `seed` is provided, the app hashes the seed string to a 32-bit integer and uses `mulberry32`.
- The same seed + config produces the same cue sequence.

## Speech Notes

The app uses the browser Speech Synthesis API (`window.speechSynthesis`). Available voices and pronunciation can vary by browser, OS, and installed voice packs.
