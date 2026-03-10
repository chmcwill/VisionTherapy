Color Cue Therapy App
Codex 5.3 Implementation Specification

This document is written specifically so a coding agent (Codex 5.3) can generate the full repository deterministically.

The resulting application must be a very small static web app deployed on Cloudflare Pages with no backend.

1. Objective

Implement a public web application that:

Allows a user to select a set of colors.

Allows a user to specify a frequency in Hz.

Allows a user to specify a duration in seconds.

Optionally accepts a seed for deterministic randomness.

Speaks a random color name aloud at the specified frequency.

Stops automatically after the requested duration.

Speaks a congratulatory message at the end.

Allows users to share sessions through URL parameters.

The entire app must run client-side in the browser.

No server or API is required.

2. Architecture

The project must be implemented as a static site consisting only of:

HTML

CSS

JavaScript

No frameworks.

No dependencies.

No build step.

The app will be deployed to Cloudflare Pages by simply uploading these files.

3. Repository Layout

Codex must generate this exact structure:

color-cue-app/
├── index.html
├── styles.css
├── app.js
├── _headers
├── README.md
└── .gitignore

Do not include:

package.json
node_modules
framework code
build tooling
4. UI Requirements

The app is a single-page application.

Page Title
Color Cue Therapy Tool
Instruction Text
Select colors, choose a frequency and duration, then press Start.
5. HTML Layout

The page must include the following elements.

All IDs must match exactly.

<form id="config-form">

  <fieldset id="colors-fieldset">
    <label><input type="checkbox" name="color" value="red"> Red</label>
    <label><input type="checkbox" name="color" value="blue"> Blue</label>
    <label><input type="checkbox" name="color" value="green"> Green</label>
    <label><input type="checkbox" name="color" value="yellow"> Yellow</label>
  </fieldset>

  <label for="hz-input">Frequency (Hz)</label>
  <input id="hz-input" type="number" step="0.1" min="0.1" max="5">

  <label for="seconds-input">Duration (seconds)</label>
  <input id="seconds-input" type="number" step="1" min="1" max="3600">

  <label for="seed-input">Seed (optional)</label>
  <input id="seed-input" type="text">

  <div id="error-message"></div>

  <button id="start-button" type="button">Start</button>
  <button id="stop-button" type="button">Stop</button>
  <button id="copy-link-button" type="button">Copy Share Link</button>

</form>

<section id="status-panel">

  <p>Status: <span id="status-text">Ready</span></p>
  <p>Current cue: <span id="current-cue">None</span></p>
  <p>Elapsed: <span id="elapsed-text">0.0</span>s</p>
  <p>Remaining: <span id="remaining-text">0.0</span>s</p>

</section>
6. Default Values

If the user opens the page without query parameters, the form must load with:

colors: red, blue, green
hz: 1
seconds: 30
seed: empty
7. Query Parameter Contract

The application must parse the following query parameters.

colors

Comma-separated list.

Example:

colors=red,blue,green
hz

Example:

hz=0.5
seconds

Example:

seconds=30
seed

Optional.

Example:

seed=myseed123
Example Full URL
/?colors=blue,red,green,yellow&hz=0.5&seconds=30&seed=123
8. Validation Rules

Validation must occur before a session begins.

Colors

At least one must be selected.

Frequency
0.1 <= hz <= 5
Duration
1 <= seconds <= 3600

If validation fails:

Display an error message in:

#error-message
9. Random Number Generator

Two modes must exist.

No Seed

Use:

Math.random()
Seeded Mode

If a seed exists:

Use a deterministic PRNG.

Codex must implement:

mulberry32

Example structure:

function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

A string seed must first be hashed into an integer.

10. Speech Synthesis

The app must use the browser's speech synthesis API.

Required objects:

window.speechSynthesis
SpeechSynthesisUtterance
Speaking a color
let utterance = new SpeechSynthesisUtterance(color);
utterance.lang = "en-US";
speechSynthesis.speak(utterance);

Before starting a session:

speechSynthesis.cancel()
11. Completion Message

At the end of the session, the app must speak:

Great job, session complete
12. Application State

Use a single state object:

const state = {
  running: false,
  sessionStartMs: null,
  timeoutId: null,
  rng: null,
  config: null,
  currentCue: null
};
13. Timing Logic

Frequency:

intervalMs = 1000 / hz

Session end condition:

elapsedMs >= seconds * 1000
Session Algorithm

Start session

Save start time

Generate first cue immediately

Schedule next cue

Continue until duration reached

Speak completion message

Stop

Pseudo flow:

emitCue()

if elapsed >= duration
    finishSession()

choose random color
speak color
schedule next cue
14. Required JavaScript Functions

Codex must implement these functions:

getSelectedColors()
getFormValues()
validateConfig(config)
createRandomFn(seed)
pickRandomColor(colors, rng)
speakText(text)
cancelSpeech()

startSession(config)
stopSession()
finishSession()

readConfigFromUrl()
buildShareUrl(config)
copyShareLink()

updateRuntimeDisplay()
setStatus(text)
setError(text)
clearError()
15. Share Link Behavior

Clicking Copy Share Link must:

Read current form values

Generate URL with query parameters

Copy using:

navigator.clipboard.writeText(url)

Example result:

https://example.pages.dev/?colors=red,green,blue&hz=1&seconds=30
16. Styling Requirements

styles.css should:

center page

max width ~640px

readable font

large buttons

responsive layout

minimal styling

Avoid frameworks.

17. Cloudflare Pages Configuration

Deployment uses static hosting.

No build step.

Settings
Framework preset: none
Build command: none
Output directory: /
18. Security Headers

Create _headers file:

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
19. README Requirements

The README must include:

description

how to run locally

how to deploy to Cloudflare Pages

explanation of query parameters

explanation of seeded randomness

note about browser speech voices differing

20. Local Development

Users can run locally with:

python -m http.server 8000

Then open:

http://localhost:8000
21. Testing Checklist

The finished application must pass:

Functional

loads with defaults

parses URL parameters

validates inputs

start button works

stop button works

cues spoken at correct frequency

session stops correctly

completion message plays

share link copies correctly

Randomness

seeded sessions reproduce same sequence

non-seeded sessions differ each run

22. Acceptance Criteria

The project is complete when:

A user can open the site and:

Choose colors

Set Hz

Set duration

Optionally set seed

Press Start

Hear color cues spoken at the correct interval

Hear a completion message at the end

Share the configuration using a URL

End of Specification