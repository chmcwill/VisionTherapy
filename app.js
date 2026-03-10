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

const DEFAULT_OPTION_COUNTS = {
  red: 4,
  blue: 4,
  yellow: 3,
  green: 3
};

const POSITION_OPTIONS = {
  1: [""],
  2: ["left", "right"],
  3: ["left", "middle", "right"],
  4: ["far left", "left", "right", "far right"]
};

const DEFAULT_CONFIG = {
  colors: ["red", "blue", "yellow", "green"],
  optionCounts: {
    red: 4,
    blue: 4,
    yellow: 3,
    green: 3
  },
  hz: 0.5,
  seconds: 30,
  seed: ""
};

const MIN_HZ = 0.25;
const MAX_HZ = 1.5;
const MIN_SECONDS = 10;
const MAX_SECONDS = 60;
const MIN_OPTIONS = 1;
const MAX_OPTIONS = 4;

const state = {
  running: false,
  sessionStartMs: null,
  timeoutId: null,
  endTimeoutId: null,
  rng: null,
  config: null,
  currentCue: null,
  displayIntervalId: null,
  nextCueTargetMs: null,
  selectedVoice: null,
  speechDurationFactor: 1.1,
  transitionCompMs: 70,
  draggedColor: null,
  tapSelectedColor: null,
  touchMode: false,
  speechSupported: "speechSynthesis" in window,
  boardInitialized: false
};

const elements = {
  form: document.getElementById("config-form"),
  colorsFieldset: document.getElementById("colors-fieldset"),
  colorBank: document.getElementById("color-bank"),
  optionZones: Array.from(document.querySelectorAll(".option-zone")),
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
  remainingText: document.getElementById("remaining-text"),
  optionZoneBodies: {},
  colorBankBody: null
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatHzValue(value) {
  const rounded = Math.round(value * 100) / 100;
  const hundred = Math.round(rounded * 100);
  if (hundred % 10 === 0) {
    return rounded.toFixed(1);
  }
  return rounded.toFixed(2);
}

function titleCase(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getDefaultOptionCount(color) {
  return DEFAULT_OPTION_COUNTS[color] || 1;
}

function sanitizeOptionCount(value) {
  if (!Number.isInteger(value)) {
    return null;
  }
  if (value < MIN_OPTIONS || value > MAX_OPTIONS) {
    return null;
  }
  return value;
}

function getColorChip(color) {
  return elements.colorsFieldset.querySelector('.color-chip[data-color="' + color + '"]');
}

function setTapSelectedColor(color) {
  state.tapSelectedColor = color;
  elements.colorsFieldset.querySelectorAll(".color-chip").forEach(function (chip) {
    chip.classList.remove("is-selected");
  });
  if (!color) {
    return;
  }
  const chip = getColorChip(color);
  if (chip) {
    chip.classList.add("is-selected");
  }
}

function getDropBodyForCount(optionCount) {
  if (optionCount === 0) {
    return elements.colorBankBody;
  }
  return elements.optionZoneBodies[optionCount] || null;
}

function moveColorToOptionCount(color, optionCount) {
  const chip = getColorChip(color);
  const targetBody = getDropBodyForCount(optionCount);
  if (!chip || !targetBody) {
    return;
  }
  targetBody.appendChild(chip);
}

function getColorOptionCounts() {
  const optionCounts = {};
  for (const zone of elements.optionZones) {
    const optionCount = Number.parseInt(zone.dataset.optionCount, 10);
    zone.querySelectorAll(".color-chip").forEach(function (chip) {
      optionCounts[chip.dataset.color] = optionCount;
    });
  }
  return optionCounts;
}

function getSelectedColors() {
  const colors = [];
  for (const zone of elements.optionZones) {
    zone.querySelectorAll(".color-chip").forEach(function (chip) {
      colors.push(chip.dataset.color);
    });
  }
  return colors;
}

function getFormValues() {
  return {
    colors: getSelectedColors(),
    optionCounts: getColorOptionCounts(),
    hz: Number.parseFloat(elements.hzInput.value),
    seconds: Number.parseInt(elements.secondsInput.value, 10),
    seed: elements.seedInput.value.trim()
  };
}

function validateConfig(config) {
  if (!Array.isArray(config.colors) || config.colors.length === 0) {
    return { valid: false, error: "Drag at least one color into an option zone." };
  }

  for (const color of config.colors) {
    if (!AVAILABLE_COLORS.includes(color)) {
      return { valid: false, error: "One or more selected colors are invalid." };
    }
    const optionCount = sanitizeOptionCount(config.optionCounts[color]);
    if (optionCount === null) {
      return {
        valid: false,
        error: "Each selected color must have an option count from 1 to 4."
      };
    }
  }

  if (!Number.isFinite(config.hz) || config.hz < MIN_HZ || config.hz > MAX_HZ) {
    return { valid: false, error: "Frequency must be between 0.25 and 1.5 Hz." };
  }

  if (
    !Number.isInteger(config.seconds) ||
    config.seconds < MIN_SECONDS ||
    config.seconds > MAX_SECONDS
  ) {
    return { valid: false, error: "Duration must be between 10 and 60 seconds." };
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

function buildCueText(color, optionCount, rng) {
  const options = POSITION_OPTIONS[optionCount] || POSITION_OPTIONS[1];
  if (optionCount === 1) {
    return color;
  }
  const index = Math.floor(rng() * options.length);
  return color + " " + options[index];
}

function estimateCueMsAtRateOne(text) {
  const cleanText = String(text || "").trim();
  const charCount = Math.max(3, cleanText.length);
  return 340 + charCount * 240;
}

function computeCueRate(text, hz) {
  const intervalMs = 1000 / hz;
  const desiredMs = intervalMs * 0.93;
  const baseMsAtRateOne = estimateCueMsAtRateOne(text) * state.speechDurationFactor;
  const rate = baseMsAtRateOne / desiredMs;
  return clamp(rate, 0.8, 10);
}

function updateTransitionComp(startLatencyMs) {
  if (!Number.isFinite(startLatencyMs)) {
    return;
  }
  const observedLatencyMs = clamp(startLatencyMs, 0, 300);
  const nextComp = state.transitionCompMs * 0.8 + observedLatencyMs * 0.2;
  state.transitionCompMs = clamp(nextComp, 0, 120);
}

function updateSpeechDurationModel(text, rate, startedAtMs, endedAtMs) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return;
  }
  const actualMs = Math.max(1, endedAtMs - startedAtMs);
  const observedAtRateOne = actualMs * clamp(rate, 0.1, 10);
  const estimatedAtRateOne = estimateCueMsAtRateOne(text);
  const observedFactor = observedAtRateOne / estimatedAtRateOne;
  const nextFactor = state.speechDurationFactor * 0.75 + observedFactor * 0.25;
  state.speechDurationFactor = clamp(nextFactor, 0.8, 3.5);
}

function speakText(text, options) {
  if (!("speechSynthesis" in window)) {
    if (options && typeof options.onend === "function") {
      options.onend();
    }
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  if (state.selectedVoice) {
    utterance.voice = state.selectedVoice;
  }
  if (options && Number.isFinite(options.rate)) {
    utterance.rate = clamp(options.rate, 0.1, 10);
  }
  if (options && typeof options.onstart === "function") {
    utterance.onstart = options.onstart;
  }
  if (options && typeof options.onend === "function") {
    utterance.onend = options.onend;
  }
  if (options && typeof options.onerror === "function") {
    utterance.onerror = options.onerror;
  }
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

  if (!state.running || state.sessionStartMs === null || !state.config) {
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
  const blockedBySpeechSupport = !state.speechSupported;
  elements.startButton.disabled = state.running || !validation.valid || blockedBySpeechSupport;
  elements.stopButton.disabled = !state.running;
  if (!state.running) {
    if (!state.speechSupported) {
      setError(
        "Speech synthesis is not supported in this browser. Please use Chrome, Safari, or another supported browser."
      );
    } else if (validation.valid) {
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
  if (state.endTimeoutId !== null) {
    clearTimeout(state.endTimeoutId);
    state.endTimeoutId = null;
  }
  if (state.displayIntervalId !== null) {
    clearInterval(state.displayIntervalId);
    state.displayIntervalId = null;
  }
}

function finishSession() {
  if (!state.running || !state.config || state.sessionStartMs === null) {
    return;
  }

  const elapsedMs = Date.now() - state.sessionStartMs;
  stopTimers();
  state.running = false;
  state.currentCue = null;
  state.nextCueTargetMs = null;
  elements.currentCue.textContent = "None";
  updateRuntimeDisplay(elapsedMs);
  setStatus("Completed");
  speakText("Great job, session complete");
  syncControlState();
}

function emitCue() {
  if (!state.running || !state.config || state.sessionStartMs === null || !state.rng) {
    return;
  }

  const nowMs = Date.now();
  const totalMs = state.config.seconds * 1000;
  const elapsedMs = nowMs - state.sessionStartMs;
  if (elapsedMs >= totalMs) {
    finishSession();
    return;
  }

  const color = pickRandomColor(state.config.colors, state.rng);
  const optionCount = state.config.optionCounts[color] || 1;
  const cueText = buildCueText(color, optionCount, state.rng);
  state.currentCue = cueText;
  elements.currentCue.textContent = cueText;

  const intervalMs = 1000 / state.config.hz;
  const rate = computeCueRate(cueText, state.config.hz);
  const cueMetrics = {
    requestedAtMs: Date.now(),
    startedAtMs: null
  };

  speakText(cueText, {
    rate: rate,
    onstart: function () {
      cueMetrics.startedAtMs = Date.now();
      updateTransitionComp(cueMetrics.startedAtMs - cueMetrics.requestedAtMs);
    },
    onend: function () {
      updateSpeechDurationModel(cueText, rate, cueMetrics.startedAtMs, Date.now());
    },
    onerror: function () {
      updateSpeechDurationModel(cueText, rate, cueMetrics.startedAtMs, Date.now());
    }
  });

  state.nextCueTargetMs += intervalMs;
  const maxCompMs = Math.min(intervalMs * 0.2, 80);
  const effectiveCompMs = Math.min(state.transitionCompMs, maxCompMs);
  const delayMs = Math.max(0, state.nextCueTargetMs - Date.now() - effectiveCompMs);
  state.timeoutId = setTimeout(emitCue, delayMs);
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

  const optionCounts = {};
  for (const color of config.colors) {
    optionCounts[color] = sanitizeOptionCount(config.optionCounts[color]) || 1;
  }

  state.config = {
    colors: config.colors.slice(),
    optionCounts: optionCounts,
    hz: config.hz,
    seconds: config.seconds,
    seed: config.seed
  };
  state.currentCue = null;
  state.speechDurationFactor = 1.1;
  state.transitionCompMs = 70;
  state.nextCueTargetMs = state.sessionStartMs + state.transitionCompMs;
  elements.currentCue.textContent = "None";
  setStatus("Running");
  updateRuntimeDisplay(0);
  stopTimers();
  state.displayIntervalId = setInterval(updateRuntimeDisplay, 100);
  state.endTimeoutId = setTimeout(finishSession, config.seconds * 1000);
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
  state.nextCueTargetMs = null;
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

function parseOptionsParam(rawValue) {
  const optionCounts = {};
  if (!rawValue) {
    return optionCounts;
  }

  rawValue.split(",").forEach(function (token) {
    const parts = token.split(":");
    if (parts.length !== 2) {
      return;
    }
    const color = parts[0].trim().toLowerCase();
    const count = Number.parseInt(parts[1].trim(), 10);
    if (!AVAILABLE_COLORS.includes(color)) {
      return;
    }
    const normalizedCount = sanitizeOptionCount(count);
    if (normalizedCount === null) {
      return;
    }
    optionCounts[color] = normalizedCount;
  });

  return optionCounts;
}

function readConfigFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const config = {
    colors: DEFAULT_CONFIG.colors.slice(),
    optionCounts: {},
    hz: DEFAULT_CONFIG.hz,
    seconds: DEFAULT_CONFIG.seconds,
    seed: DEFAULT_CONFIG.seed
  };

  if (params.has("colors")) {
    config.colors = sanitizeColors(params.get("colors").split(","));
  }

  const parsedOptions = parseOptionsParam(params.get("options"));
  for (const color of config.colors) {
    config.optionCounts[color] = parsedOptions[color] || getDefaultOptionCount(color);
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
  setTapSelectedColor(null);

  for (const color of AVAILABLE_COLORS) {
    moveColorToOptionCount(color, 0);
  }

  const selectedColors = sanitizeColors(config.colors || []);
  const providedOptionCounts = config.optionCounts || {};
  for (const color of selectedColors) {
    const optionCount = sanitizeOptionCount(providedOptionCounts[color]) || getDefaultOptionCount(color);
    moveColorToOptionCount(color, optionCount);
  }

  const hz = Number.isFinite(config.hz) ? config.hz : DEFAULT_CONFIG.hz;
  const seconds = Number.isFinite(config.seconds) ? config.seconds : DEFAULT_CONFIG.seconds;
  elements.hzInput.value = String(hz);
  elements.secondsInput.value = String(seconds);
  elements.seedInput.value = config.seed || "";
  elements.hzValue.textContent = formatHzValue(Number.parseFloat(elements.hzInput.value));
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
  const optionTokens = config.colors.map(function (color) {
    return color + ":" + String(config.optionCounts[color] || getDefaultOptionCount(color));
  });
  url.searchParams.set("options", optionTokens.join(","));
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

function wireDropZone(zoneElement, optionCount) {
  zoneElement.addEventListener("dragover", function (event) {
    if (state.touchMode) {
      return;
    }
    event.preventDefault();
    zoneElement.classList.add("is-over");
  });

  zoneElement.addEventListener("dragleave", function () {
    zoneElement.classList.remove("is-over");
  });

  zoneElement.addEventListener("drop", function (event) {
    if (state.touchMode) {
      return;
    }
    event.preventDefault();
    zoneElement.classList.remove("is-over");
    const color =
      event.dataTransfer.getData("text/plain").trim().toLowerCase() || state.draggedColor;
    if (!AVAILABLE_COLORS.includes(color)) {
      return;
    }
    moveColorToOptionCount(color, optionCount);
    setTapSelectedColor(null);
    state.draggedColor = null;
    const movedChip = getColorChip(color);
    if (movedChip) {
      movedChip.classList.remove("is-dragging");
    }
    syncControlState();
  });

  zoneElement.addEventListener("click", function (event) {
    const target = event.target;
    if (target instanceof Element && target.closest(".color-chip")) {
      return;
    }
    if (!state.tapSelectedColor) {
      return;
    }
    moveColorToOptionCount(state.tapSelectedColor, optionCount);
    setTapSelectedColor(null);
    syncControlState();
  });
}

function initializeColorBoard() {
  if (state.boardInitialized) {
    return;
  }

  state.touchMode = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

  elements.colorBankBody = elements.colorBank.querySelector(".zone-chips");
  elements.optionZoneBodies = {};
  elements.optionZones.forEach(function (zone) {
    const optionCount = Number.parseInt(zone.dataset.optionCount, 10);
    elements.optionZoneBodies[optionCount] = zone.querySelector(".zone-chips");
  });

  for (const color of AVAILABLE_COLORS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "color-chip";
    chip.draggable = !state.touchMode;
    chip.dataset.color = color;
    chip.textContent = titleCase(color);
    chip.addEventListener("dragstart", function (event) {
      if (state.touchMode) {
        return;
      }
      state.draggedColor = color;
      setTapSelectedColor(null);
      chip.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", color);
        event.dataTransfer.effectAllowed = "move";
      }
    });
    chip.addEventListener("dragend", function () {
      chip.classList.remove("is-dragging");
      state.draggedColor = null;
    });
    chip.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      const nextColor = state.tapSelectedColor === color ? null : color;
      setTapSelectedColor(nextColor);
    });
    chip.addEventListener("touchend", function () {
      chip.classList.remove("is-dragging");
      state.draggedColor = null;
    });
    chip.addEventListener("touchcancel", function () {
      chip.classList.remove("is-dragging");
      state.draggedColor = null;
    });
    chip.addEventListener("pointerup", function () {
      chip.classList.remove("is-dragging");
      state.draggedColor = null;
    });
    chip.addEventListener("pointercancel", function () {
      chip.classList.remove("is-dragging");
      state.draggedColor = null;
    });
    elements.colorBankBody.appendChild(chip);
  }

  wireDropZone(elements.colorBank, 0);
  elements.optionZones.forEach(function (zone) {
    const optionCount = Number.parseInt(zone.dataset.optionCount, 10);
    wireDropZone(zone, optionCount);
  });

  state.boardInitialized = true;
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
    elements.hzValue.textContent = formatHzValue(Number.parseFloat(elements.hzInput.value));
    elements.secondsValue.textContent = String(
      Number.parseInt(elements.secondsInput.value, 10)
    );
    syncControlState();
  });
}

function init() {
  if (state.speechSupported) {
    const pickVoice = function () {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(function (voice) {
        return voice.lang === "en-US" && voice.localService;
      });
      const fallback = voices.find(function (voice) {
        return voice.lang && voice.lang.toLowerCase().startsWith("en");
      });
      state.selectedVoice = preferred || fallback || null;
    };

    pickVoice();
    if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = pickVoice;
    }
  }

  initializeColorBoard();
  const initialConfig = readConfigFromUrl();
  applyConfigToForm(initialConfig);
  wireEvents();
  setStatus("Ready");
  updateRuntimeDisplay();
  syncControlState();
}

window.ColorCueApp = {
  AVAILABLE_COLORS,
  DEFAULT_CONFIG,
  MIN_HZ,
  MAX_HZ,
  MIN_SECONDS,
  MAX_SECONDS,
  state,
  elements,
  getDefaultOptionCount,
  getColorOptionCounts,
  getSelectedColors,
  getFormValues,
  validateConfig,
  createRandomFn,
  pickRandomColor,
  buildCueText,
  computeCueRate,
  speakText,
  cancelSpeech,
  startSession,
  stopSession,
  finishSession,
  parseOptionsParam,
  readConfigFromUrl,
  buildShareUrl,
  copyShareLink,
  updateRuntimeDisplay,
  setStatus,
  setError,
  clearError,
  sanitizeColors,
  applyConfigToForm,
  moveColorToOptionCount,
  syncControlState,
  init
};

if (!window.__COLOR_CUE_TEST__) {
  init();
}
