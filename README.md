# Color Cue Therapy Tool

Small static web app for color-cue speech exercises. Users select colors, frequency, duration, and an optional seed, then run a spoken cue session in the browser.

## Features

- Client-side only (HTML/CSS/JavaScript, no backend)
- Color cue playback using browser speech synthesis
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

## Deploy To Cloudflare Pages

Use static hosting with no build:

- Framework preset: `None`
- Build command: `None`
- Output directory: `/`

Upload/connect this repo as-is.

## Query Parameters

Supported URL params:

- `colors`: comma-separated list of colors
- `hz`: cue frequency in Hz (app enforces max 2 Hz)
- `seconds`: session duration in seconds
- `seed`: optional deterministic seed

Example:

```text
/?colors=red,blue,yellow,green&hz=1&seconds=30&seed=myseed123
```

## Seeded Randomness

- If `seed` is empty, cue selection uses `Math.random()`.
- If `seed` is provided, the app hashes the seed string to a 32-bit integer and uses `mulberry32`.
- The same seed + config produces the same cue sequence.

## Speech Notes

The app uses the browser Speech Synthesis API (`window.speechSynthesis`). Available voices and pronunciation can vary by browser, OS, and installed voice packs.
