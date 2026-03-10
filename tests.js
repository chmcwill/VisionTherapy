(function () {
  const app = window.ColorCueApp;
  const resultsNode = document.getElementById("results");
  const tests = [];

  function test(name, fn) {
    tests.push({ name, fn });
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed.");
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        (message || "Values are not equal.") + " Expected: " + expected + ", got: " + actual
      );
    }
  }

  function assertArrayEqual(actual, expected, message) {
    assertEqual(actual.length, expected.length, message || "Array lengths differ.");
    for (let i = 0; i < actual.length; i += 1) {
      if (actual[i] !== expected[i]) {
        throw new Error(
          (message || "Arrays differ.") +
            " Index " +
            i +
            ": expected " +
            expected[i] +
            ", got " +
            actual[i]
        );
      }
    }
  }

  function resetUrl(search) {
    const path = window.location.pathname + (search || "");
    window.history.replaceState({}, "", path);
  }

  function setColorOptions(optionCounts) {
    const colors = Object.keys(optionCounts);
    app.applyConfigToForm({
      colors: colors,
      optionCounts: optionCounts,
      hz: 1,
      seconds: 30,
      seed: ""
    });
  }

  function withFakeTimers(runFn) {
    const originalDateNow = Date.now;
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    const originalSetInterval = window.setInterval;
    const originalClearInterval = window.clearInterval;

    let nowMs = 0;
    let nextTimerId = 1;
    const timers = new Map();

    function schedule(fn, delay, repeat) {
      const parsedDelay = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, {
        fn,
        time: nowMs + parsedDelay,
        repeat,
        delay: parsedDelay
      });
      return id;
    }

    function tick(ms) {
      const targetTime = nowMs + ms;
      while (true) {
        let nextId = null;
        let nextTime = Number.POSITIVE_INFINITY;

        timers.forEach(function (timer, id) {
          if (timer.time < nextTime) {
            nextTime = timer.time;
            nextId = id;
          }
        });

        if (nextId === null || nextTime > targetTime) {
          break;
        }

        nowMs = nextTime;
        const timer = timers.get(nextId);
        if (!timer) {
          continue;
        }

        if (timer.repeat) {
          timer.time = nowMs + timer.delay;
          timers.set(nextId, timer);
        } else {
          timers.delete(nextId);
        }

        timer.fn();
      }

      nowMs = targetTime;
    }

    Date.now = function () {
      return nowMs;
    };

    window.setTimeout = function (fn, delay) {
      return schedule(fn, delay, false);
    };

    window.clearTimeout = function (id) {
      timers.delete(id);
    };

    window.setInterval = function (fn, delay) {
      return schedule(fn, delay, true);
    };

    window.clearInterval = function (id) {
      timers.delete(id);
    };

    try {
      return runFn({ tick: tick });
    } finally {
      Date.now = originalDateNow;
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
      window.setInterval = originalSetInterval;
      window.clearInterval = originalClearInterval;
      timers.clear();
    }
  }

  function withPatchedSpeech(runFn) {
    if (!("speechSynthesis" in window) || !window.speechSynthesis) {
      return runFn({
        calls: [],
        getCancelCount: function () {
          return 0;
        },
        patched: false
      });
    }

    const speech = window.speechSynthesis;
    const originalSpeak = speech.speak;
    const originalCancel = speech.cancel;
    const calls = [];
    let cancelCount = 0;
    let patched = false;

    try {
      speech.speak = function (utterance) {
        calls.push({
          text: utterance.text,
          rate: utterance.rate
        });
        if (typeof utterance.onstart === "function") {
          utterance.onstart();
        }
        if (typeof utterance.onend === "function") {
          setTimeout(function () {
            utterance.onend();
          }, 0);
        }
      };
      speech.cancel = function () {
        cancelCount += 1;
      };
      patched = true;

      return runFn({
        calls: calls,
        getCancelCount: function () {
          return cancelCount;
        },
        patched: true
      });
    } catch (error) {
      return runFn({
        calls: calls,
        getCancelCount: function () {
          return cancelCount;
        },
        patched: false
      });
    } finally {
      if (patched) {
        speech.speak = originalSpeak;
        speech.cancel = originalCancel;
      }
    }
  }

  app.init();

  test("defaults are valid", function () {
    app.applyConfigToForm(app.DEFAULT_CONFIG);
    const values = app.getFormValues();
    const validation = app.validateConfig(values);
    assert(validation.valid, "Default form values should validate.");
    assertEqual(values.optionCounts.red, 4);
    assertEqual(values.optionCounts.blue, 4);
    assertEqual(values.optionCounts.yellow, 3);
    assertEqual(values.optionCounts.green, 3);
  });

  test("validateConfig rejects empty colors", function () {
    const result = app.validateConfig({
      colors: [],
      optionCounts: {},
      hz: 1,
      seconds: 30,
      seed: ""
    });
    assert(!result.valid, "Expected validation failure.");
  });

  test("validateConfig accepts boundary values", function () {
    const minResult = app.validateConfig({
      colors: ["red"],
      optionCounts: { red: 1 },
      hz: app.MIN_HZ,
      seconds: app.MIN_SECONDS,
      seed: ""
    });
    const maxResult = app.validateConfig({
      colors: ["blue"],
      optionCounts: { blue: 4 },
      hz: app.MAX_HZ,
      seconds: app.MAX_SECONDS,
      seed: ""
    });
    assert(minResult.valid, "Minimum boundary should pass.");
    assert(maxResult.valid, "Maximum boundary should pass.");
  });

  test("parseOptionsParam reads valid option tokens", function () {
    const options = app.parseOptionsParam("red:4,blue:2,invalid:3,green:7");
    assertEqual(options.red, 4);
    assertEqual(options.blue, 2);
    assert(options.invalid === undefined, "Invalid color should be ignored.");
    assert(options.green === undefined, "Out-of-range option count should be ignored.");
  });

  test("seeded random generator is deterministic", function () {
    const rngA = app.createRandomFn("stable-seed");
    const rngB = app.createRandomFn("stable-seed");
    const seqA = [rngA(), rngA(), rngA(), rngA(), rngA()];
    const seqB = [rngB(), rngB(), rngB(), rngB(), rngB()];
    assertArrayEqual(seqA, seqB, "Seeded sequences should match.");
  });

  test("buildCueText uses the configured option count", function () {
    const fixedRng = function () {
      return 0.51;
    };
    assertEqual(app.buildCueText("red", 1, fixedRng), "red");
    assertEqual(app.buildCueText("red", 2, fixedRng), "red right");
    assertEqual(app.buildCueText("green", 3, fixedRng), "green middle");
    assertEqual(app.buildCueText("blue", 4, fixedRng), "blue right");
  });

  test("readConfigFromUrl parses colors and options", function () {
    resetUrl("?colors=blue,green&options=blue:2,green:3&hz=1.5&seconds=45&seed=abc123");
    const config = app.readConfigFromUrl();
    assertArrayEqual(config.colors, ["blue", "green"]);
    assertEqual(config.optionCounts.blue, 2);
    assertEqual(config.optionCounts.green, 3);
    assertEqual(config.hz, 1.5);
    assertEqual(config.seconds, 45);
    assertEqual(config.seed, "abc123");
    resetUrl("");
  });

  test("start button disabled for invalid config and enabled for valid config", function () {
    setColorOptions({});
    app.syncControlState();
    assert(app.elements.startButton.disabled, "Start should be disabled with no selected colors.");

    setColorOptions({ red: 4 });
    app.elements.hzInput.value = "1";
    app.elements.secondsInput.value = "30";
    app.syncControlState();
    assert(!app.elements.startButton.disabled, "Start should be enabled for valid inputs.");
  });

  test("buildShareUrl includes options map", function () {
    const shareUrl = new URL(
      app.buildShareUrl({
        colors: ["red", "green"],
        optionCounts: { red: 4, green: 3 },
        hz: 1,
        seconds: 10,
        seed: ""
      })
    );
    assertEqual(shareUrl.searchParams.get("colors"), "red,green");
    assertEqual(shareUrl.searchParams.get("options"), "red:4,green:3");
  });

  test("manual stop announces 'exercise stopped'", function () {
    withPatchedSpeech(function (speech) {
      app.state.running = true;
      app.state.config = {
        colors: ["red"],
        optionCounts: { red: 1 },
        hz: 1,
        seconds: 30,
        seed: ""
      };
      app.state.sessionStartMs = Date.now();
      app.stopSession(true);
      assert(
        speech.calls.some(function (call) {
          return call.text === "exercise stopped";
        }),
        "Expected manual stop phrase."
      );
    });
  });

  test("session stops at exact configured duration", function () {
    withFakeTimers(function (clock) {
      withPatchedSpeech(function (speech) {
        app.startSession({
          colors: ["red"],
          optionCounts: { red: 1 },
          hz: 0.5,
          seconds: 10,
          seed: ""
        });

        assert(app.state.running, "Session should start.");
        clock.tick(9999);
        assert(app.state.running, "Session should still run just before cutoff.");
        clock.tick(1);
        assert(!app.state.running, "Session should stop exactly at duration boundary.");
        assertEqual(app.elements.statusText.textContent, "Completed");
        assert(
          speech.calls.some(function (call) {
            return call.text === "Great job, session complete";
          }),
          "Expected completion phrase."
        );
      });
    });
  });

  test("cue speech rate increases as Hz increases", function () {
    const lowRate = app.computeCueRate("yellow middle", app.MIN_HZ);
    const highRate = app.computeCueRate("yellow middle", app.MAX_HZ);
    assert(highRate > lowRate, "Higher Hz should produce a higher speech rate.");
    assert(highRate >= 3, "High-Hz cue rate should be strongly compressed.");
    assert(highRate <= 10, "Speech rate should stay within configured ceiling.");
  });

  test("max Hz for 10s schedules correct cue count", function () {
    withFakeTimers(function (clock) {
      withPatchedSpeech(function (speech) {
        app.startSession({
          colors: ["red"],
          optionCounts: { red: 1 },
          hz: app.MAX_HZ,
          seconds: 10,
          seed: ""
        });

        clock.tick(10000);

        const cueCalls = speech.calls.filter(function (call) {
          return call.text === "red";
        });
        assertEqual(cueCalls.length, 15, "Expected exactly 15 cues in 10 seconds at 1.5Hz.");
      });
    });
  });

  (async function run() {
    let passed = 0;
    const lines = [];

    for (const current of tests) {
      try {
        await current.fn();
        passed += 1;
        lines.push("PASS: " + current.name);
      } catch (error) {
        lines.push("FAIL: " + current.name + "\n  " + error.message);
      }
    }

    lines.push("");
    lines.push("Summary: " + passed + "/" + tests.length + " tests passed");
    resultsNode.textContent = lines.join("\n");
  })();
})();
