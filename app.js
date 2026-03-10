const AVAILABLE_COLORS = [
  "red",
  "blue",
  "yellow",
  "green",
  "orange",
  "pink",
  "cyan",
  "purple",
  "black",
  "brown",
  "white"
];

const DEFAULT_CONFIG = {
  colors: ["red", "blue", "yellow", "green"],
  hz: 1,
  seconds: 30,
  seed: ""
};

const MIN_HZ = 0.1;
const MAX_HZ = 2;
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;

const state = {
  running: false,
  sessionStartMs: null,
  timeoutId: null,
  rng: null,
  config: null,
  currentCue: null,
  displayIntervalId: null
};

const elements = {
  form: document.getElementById("config-form"),
  colorsFieldset: document.getElementById("colors-fieldset"),
  hzInput: document.getElementById("hz-input"),
  hzValue: document.getElementById("hz-value"),
  secondsInput: document.getElementById("seconds-input"),
  secondsValue: document.getElementById("seconds-value"),
  seedInput: document.getElementById("seed-input"),
  errorMessage: document.getElementById("error-message"),
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  copyLinkButton: document.getElementById("copy-link-button"),
  statusText: document.getElementById("status-text"),
  currentCue: document.getElementById("current-cue"),
  elapsedText: document.getElementById("elapsed-text"),
  remainingText: document.getElementById("remaining-text")
};

function getSelectedColors() {
  return Array.from(
    elements.colorsFieldset.querySelectorAll('input[name="color"]:checked')
  ).map(function (input) {
    return input.value;
  });
}

function getFormValues() {
  return {
    colors: getSelectedColors(),
    hz: Number.parseFloat(elements.hzInput.value),
    seconds: Number.parseInt(elements.secondsInput.value, 10),
    seed: elements.seedInput.value.trim()
  };
}

function validateConfig(config) {
  if (!Array.isArray(config.colors) || config.colors.length === 0) {
    return { valid: false, error: "Select at least one color." };
  }

  for (const color of config.colors) {
    if (!AVAILABLE_COLORS.includes(color)) {
      return { valid: false, error: "One or more selected colors are invalid." };
    }
  }

  if (!Number.isFinite(config.hz) || config.hz < MIN_HZ || config.hz > MAX_HZ) {
    return { valid: false, error: "Frequency must be between 0.1 and 2 Hz." };
  }

  if (
    !Number.isInteger(config.seconds) ||
    config.seconds < MIN_SECONDS ||
    config.seconds > MAX_SECONDS
  ) {
    return { valid: false, error: "Duration must be between 1 and 3600 seconds." };
  }

  return { valid: true, error: "" };
}

function hashStringToInt(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRandomFn(seed) {
  if (!seed) {
    return Math.random;
  }
  return mulberry32(hashStringToInt(seed));
}

function pickRandomColor(colors, rng) {
  const index = Math.floor(rng() * colors.length);
  return colors[index];
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

function cancelSpeech() {
  if (!("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function setError(text) {
  elements.errorMessage.textContent = text;
}

function clearError() {
  elements.errorMessage.textContent = "";
}

function updateRuntimeDisplay(forceElapsedMs) {
  if (typeof forceElapsedMs === "number" && state.config) {
    const totalMs = state.config.seconds * 1000;
    const elapsedMs = Math.min(forceElapsedMs, totalMs);
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    elements.elapsedText.textContent = (elapsedMs / 1000).toFixed(1);
    elements.remainingText.textContent = (remainingMs / 1000).toFixed(1);
    return;
  }

  if (!state.running || !state.sessionStartMs || !state.config) {
    elements.elapsedText.textContent = "0.0";
    elements.remainingText.textContent = "0.0";
    return;
  }

  const totalMs = state.config.seconds * 1000;
  const elapsedMs = Math.min(Date.now() - state.sessionStartMs, totalMs);
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  elements.elapsedText.textContent = (elapsedMs / 1000).toFixed(1);
  elements.remainingText.textContent = (remainingMs / 1000).toFixed(1);
}

function syncControlState() {
  const validation = validateConfig(getFormValues());
  elements.startButton.disabled = state.running || !validation.valid;
  elements.stopButton.disabled = !state.running;
  if (!state.running) {
    if (validation.valid) {
      clearError();
    } else {
      setError(validation.error);
    }
  }
}

function stopTimers() {
  if (state.timeoutId !== null) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
  if (state.displayIntervalId !== null) {
    clearInterval(state.displayIntervalId);
    state.displayIntervalId = null;
  }
}

function finishSession() {
  if (!state.running || !state.config || !state.sessionStartMs) {
    return;
  }

  const elapsedMs = Date.now() - state.sessionStartMs;
  stopTimers();
  state.running = false;
  state.currentCue = null;
  elements.currentCue.textContent = "None";
  updateRuntimeDisplay(elapsedMs);
  setStatus("Completed");
  speakText("Great job, session complete");
  syncControlState();
}

function emitCue() {
  if (!state.running || !state.config || !state.sessionStartMs || !state.rng) {
    return;
  }

  const elapsedMs = Date.now() - state.sessionStartMs;
  if (elapsedMs >= state.config.seconds * 1000) {
    finishSession();
    return;
  }

  const color = pickRandomColor(state.config.colors, state.rng);
  state.currentCue = color;
  elements.currentCue.textContent = color;
  speakText(color);

  const intervalMs = 1000 / state.config.hz;
  state.timeoutId = setTimeout(emitCue, intervalMs);
}

function startSession(config) {
  const validation = validateConfig(config);
  if (!validation.valid) {
    setError(validation.error);
    syncControlState();
    return;
  }

  if (state.running) {
    stopSession(false);
  }

  cancelSpeech();
  clearError();
  state.running = true;
  state.sessionStartMs = Date.now();
  state.rng = createRandomFn(config.seed);
  state.config = {
    colors: config.colors.slice(),
    hz: config.hz,
    seconds: config.seconds,
    seed: config.seed
  };
  state.currentCue = null;
  elements.currentCue.textContent = "None";
  setStatus("Running");
  updateRuntimeDisplay(0);
  stopTimers();
  state.displayIntervalId = setInterval(updateRuntimeDisplay, 100);
  syncControlState();
  emitCue();
}

function stopSession(announceStopMessage) {
  if (!state.running) {
    syncControlState();
    return;
  }

  stopTimers();
  state.running = false;
  cancelSpeech();
  state.currentCue = null;
  elements.currentCue.textContent = "None";
  state.sessionStartMs = null;
  updateRuntimeDisplay();
  setStatus("Stopped");
  if (announceStopMessage) {
    speakText("exercise stopped");
  }
  syncControlState();
}

function sanitizeColors(colorList) {
  const set = new Set();
  for (const color of colorList) {
    const normalized = color.trim().toLowerCase();
    if (AVAILABLE_COLORS.includes(normalized)) {
      set.add(normalized);
    }
  }
  return Array.from(set);
}

function readConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const config = {
    colors: DEFAULT_CONFIG.colors.slice(),
    hz: DEFAULT_CONFIG.hz,
    seconds: DEFAULT_CONFIG.seconds,
    seed: DEFAULT_CONFIG.seed
  };

  if (params.has("colors")) {
    config.colors = sanitizeColors(params.get("colors").split(","));
  }

  if (params.has("hz")) {
    const hz = Number.parseFloat(params.get("hz"));
    if (Number.isFinite(hz)) {
      config.hz = hz;
    }
  }

  if (params.has("seconds")) {
    const seconds = Number.parseInt(params.get("seconds"), 10);
    if (Number.isFinite(seconds)) {
      config.seconds = seconds;
    }
  }

  if (params.has("seed")) {
    config.seed = params.get("seed").trim();
  }

  return config;
}

function applyConfigToForm(config) {
  const selected = new Set(config.colors);
  elements.colorsFieldset
    .querySelectorAll('input[name="color"]')
    .forEach(function (input) {
      input.checked = selected.has(input.value);
    });

  const hz = Number.isFinite(config.hz) ? config.hz : DEFAULT_CONFIG.hz;
  const seconds = Number.isFinite(config.seconds) ? config.seconds : DEFAULT_CONFIG.seconds;
  elements.hzInput.value = String(hz);
  elements.secondsInput.value = String(seconds);
  elements.seedInput.value = config.seed || "";
  elements.hzValue.textContent = Number.parseFloat(elements.hzInput.value).toFixed(1);
  elements.secondsValue.textContent = String(
    Number.parseInt(elements.secondsInput.value, 10)
  );
}

function buildShareUrl(config) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("colors", config.colors.join(","));
  url.searchParams.set("hz", String(config.hz));
  url.searchParams.set("seconds", String(config.seconds));
  if (config.seed) {
    url.searchParams.set("seed", config.seed);
  }
  return url.toString();
}

async function copyShareLink() {
  const config = getFormValues();
  const validation = validateConfig(config);
  if (!validation.valid) {
    setError(validation.error);
    return;
  }

  const url = buildShareUrl(config);
  try {
    await navigator.clipboard.writeText(url);
    clearError();
    setStatus("Share link copied");
  } catch (error) {
    setError("Clipboard permission denied. Copy the URL from the address bar.");
  }
}

function wireEvents() {
  elements.startButton.addEventListener("click", function () {
    startSession(getFormValues());
  });

  elements.stopButton.addEventListener("click", function () {
    stopSession(true);
  });

  elements.copyLinkButton.addEventListener("click", function () {
    copyShareLink();
  });

  elements.form.addEventListener("input", function () {
    elements.hzValue.textContent = Number.parseFloat(elements.hzInput.value).toFixed(1);
    elements.secondsValue.textContent = String(
      Number.parseInt(elements.secondsInput.value, 10)
    );
    syncControlState();
  });
}

function init() {
  const initialConfig = readConfigFromUrl();
  applyConfigToForm(initialConfig);
  wireEvents();
  setStatus("Ready");
  updateRuntimeDisplay();
  syncControlState();
}

init();
