// public/game.js
(() => {
  const leftOperandEl = document.getElementById("leftOperand");
  const rightOperandEl = document.getElementById("rightOperand");
  const answerInput = document.getElementById("answerInput");
  const submitButton = document.getElementById("submitButton");
  const skipButton = document.getElementById("skipButton");
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const maxTableSelect = document.getElementById("maxTable");
  const modeSelect = document.getElementById("mode");
  const baseTableSelect = document.getElementById("baseTable");
  const feedbackEl = document.getElementById("feedback");
  const correctCountEl = document.getElementById("correctCount");
  const wrongCountEl = document.getElementById("wrongCount");
  const streakCountEl = document.getElementById("streakCount");
  const accuracyEl = document.getElementById("accuracy");
  const timedInfoEl = document.getElementById("timedInfo");
  const timeDisplayEl = document.getElementById("timeDisplay");
  const keypadEl = document.getElementById("keypad");
  const contrastToggle = document.getElementById("contrastToggle");

  const resultOverlay = document.getElementById("resultOverlay");
  const resultIcon = document.getElementById("resultIcon");

  let correct = 0;
  let wrong = 0;
  let streak = 0;
  let currentAnswer = null;
  let lastQuestionKey = "";
  let isRunning = false;
  let timerId = null;
  let remainingMs = 60000; // 60 seconds
  let overlayTimeout = null;

  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.innerWidth <= 600;

  // --- Audio and vibration helpers ---
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    }
    return audioCtx;
  }

  function playTone(freq, duration, gainValue = 0.2) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.value = gainValue;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    setTimeout(() => {
      osc.stop();
    }, duration);
  }

  function playClickSound() {
    playTone(800, 60, 0.12);
  }

  function playSuccessSound() {
    playTone(900, 120, 0.2);
    setTimeout(() => playTone(1200, 120, 0.2), 100);
  }

  function playFailSound() {
    playTone(200, 160, 0.22);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // --- Core helpers ---
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function updateStats() {
    const total = correct + wrong;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    correctCountEl.textContent = correct;
    wrongCountEl.textContent = wrong;
    streakCountEl.textContent = streak;
    accuracyEl.textContent = `${accuracy}%`;
  }

  function setFeedback(message, type = "") {
    feedbackEl.textContent = message;
    feedbackEl.classList.remove("correct", "wrong");
    if (type) feedbackEl.classList.add(type);
  }

  // Format milliseconds as mm:ss.cc (centiseconds)
  function formatTime(ms) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centiseconds = Math.floor((ms % 1000) / 10);

    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    const cs = String(centiseconds).padStart(2, "0");
    return `${mm}:${ss}.${cs}`;
  }

  function updateTimeDisplay() {
    if (!timeDisplayEl) return;
    timeDisplayEl.textContent = formatTime(remainingMs);
  }

  function flashResult(type) {
    if (!resultOverlay || !resultIcon) return;

    if (overlayTimeout) {
      clearTimeout(overlayTimeout);
      overlayTimeout = null;
    }

    resultOverlay.classList.remove("hidden");
    resultIcon.classList.remove("correct-flash", "wrong-flash", "show");

    if (type === "correct") {
      resultIcon.textContent = "✓";
      resultIcon.classList.add("correct-flash");
    } else {
      resultIcon.textContent = "✕";
      resultIcon.classList.add("wrong-flash");
    }

    // Force reflow so the CSS transition retriggers
    void resultIcon.offsetWidth;
    resultIcon.classList.add("show");

    overlayTimeout = setTimeout(() => {
      resultIcon.classList.remove("show");
      resultOverlay.classList.add("hidden");
    }, 500);
  }

  function nextQuestion() {
    const maxTable = parseInt(maxTableSelect.value, 10) || 10;
    const baseVal = parseInt(baseTableSelect && baseTableSelect.value, 10);

    let a, b, key;
    do {
      if (!Number.isNaN(baseVal)) {
        // Fixed table (e.g. always 7 × ?)
        a = baseVal;
        b = randInt(1, maxTable);
      } else {
        // Mixed practice within range
        a = randInt(2, maxTable);
        b = randInt(1, maxTable);
      }
      key = `${a}x${b}`;
    } while (key === lastQuestionKey);

    lastQuestionKey = key;
    currentAnswer = a * b;

    leftOperandEl.textContent = a;
    rightOperandEl.textContent = b;

    answerInput.value = "";
    if (!isMobile) {
      answerInput.focus();
    } else {
      answerInput.blur();
    }
    setFeedback("Type your answer or use the keypad, then press Enter or Check.");
  }

  function handleCorrect() {
    correct += 1;
    streak += 1;
    setFeedback("Nice! ✅", "correct");
    flashResult("correct");
    playSuccessSound();
    vibrate(60);
    updateStats();
    nextQuestion();
  }

  function handleWrong(userValue) {
    wrong += 1;
    streak = 0;
    setFeedback(
      `Not quite. You said ${userValue}, correct is ${currentAnswer}.`,
      "wrong"
    );
    flashResult("wrong");
    playFailSound();
    vibrate([40, 40, 40]);
    updateStats();
    nextQuestion();
  }

  function submitAnswer() {
    if (!isRunning) return;
    const raw = answerInput.value.trim();
    if (raw === "") {
      setFeedback("Enter an answer first 😄");
      return;
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      setFeedback("That doesn't look like a number.");
      return;
    }
    if (value === currentAnswer) {
      handleCorrect();
    } else {
      handleWrong(value);
    }
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    remainingMs = 60000;
    timedInfoEl.classList.remove("hidden");
    updateTimeDisplay();

    timerId = setInterval(() => {
      remainingMs -= 50;
      if (remainingMs <= 0) {
        remainingMs = 0;
        updateTimeDisplay();
        stopTimer();
        isRunning = false;
        document.body.classList.remove("playing");
        setFeedback(
          `Time up! ✅ ${correct} correct, ❌ ${wrong} wrong. Accuracy: ${accuracyEl.textContent}`
        );
      } else {
        updateTimeDisplay();
      }
    }, 50);
  }

  function resetGameState() {
    correct = 0;
    wrong = 0;
    streak = 0;
    lastQuestionKey = "";
    updateStats();
  }

  // FULL reset for Stop button
  function resetEverything() {
    isRunning = false;
    stopTimer();
    remainingMs = 60000;
    updateTimeDisplay();

    correct = 0;
    wrong = 0;
    streak = 0;
    lastQuestionKey = "";
    updateStats();

    setFeedback("Press Start to begin.");
    answerInput.value = "";

    timedInfoEl.classList.add("hidden");

    if (overlayTimeout) {
      clearTimeout(overlayTimeout);
      overlayTimeout = null;
    }
    if (resultOverlay && resultIcon) {
      resultIcon.classList.remove("show", "correct-flash", "wrong-flash");
      resultOverlay.classList.add("hidden");
    }

    document.body.classList.remove("playing");
    if (keypadEl) {
      keypadEl.classList.remove("keypad-visible");
    }
  }

  function startGame() {
    isRunning = true;
    resetGameState();

    if (modeSelect.value === "timed") {
      startTimer();
    } else {
      timedInfoEl.classList.add("hidden");
      stopTimer();
      remainingMs = 60000;
      updateTimeDisplay();
    }

    document.body.classList.add("playing");
    if (keypadEl) {
      keypadEl.classList.add("keypad-visible");
    }
    if (isMobile) {
      answerInput.blur();
    } else {
      answerInput.focus();
    }
    setFeedback("Game started. Good luck! 🎯");
    nextQuestion();
  }

  // --- Custom keypad handler ---
  if (keypadEl) {
    keypadEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const key = btn.dataset.key;
      if (!key) return;

      // Click sound + light vibrate for any press
      playClickSound();
      vibrate(20);

      if (key === "back") {
        answerInput.value = answerInput.value.slice(0, -1);
      } else if (key === "clear") {
        answerInput.value = "";
      } else if (key === "enter") {
        submitAnswer();
      } else {
        // 0-9
        answerInput.value += key;
      }
    });
  }

  // --- High contrast toggle ---
  if (contrastToggle) {
    contrastToggle.addEventListener("click", () => {
      const html = document.documentElement;
      html.classList.toggle("high-contrast");
    });
  }

  // --- Event listeners ---
  startButton.addEventListener("click", () => {
    startGame();
  });

  stopButton.addEventListener("click", () => {
    resetEverything();
  });

  submitButton.addEventListener("click", () => {
    submitAnswer();
  });

  skipButton.addEventListener("click", () => {
    if (!isRunning) return;
    streak = 0;
    wrong += 1;
    updateStats();
    setFeedback(`Skipped. The answer was ${currentAnswer}.`, "wrong");
    flashResult("wrong");
    playFailSound();
    vibrate([40, 40]);
    nextQuestion();
  });

  // Desktop keyboard input support
  answerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAnswer();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (!isRunning) return;
    if (e.key >= "0" && e.key <= "9" && !isMobile) {
      answerInput.value += e.key;
    } else if (e.key === "Backspace" && !isMobile) {
      answerInput.value = answerInput.value.slice(0, -1);
    } else if (e.key === "Enter") {
      submitAnswer();
    }
  });

  // Configure input for mobile vs desktop to control keyboards
  if (isMobile) {
    answerInput.setAttribute("readonly", "true");
    answerInput.setAttribute("inputmode", "none");
  } else {
    answerInput.removeAttribute("readonly");
    answerInput.setAttribute("inputmode", "numeric");
  }

  // Start in idle state
  updateStats();
  updateTimeDisplay();
  setFeedback("Press Start to begin.");
})();
