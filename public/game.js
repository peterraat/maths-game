// public/game.js
(() => {
  const leftOperandEl = document.getElementById("leftOperand");
  const rightOperandEl = document.getElementById("rightOperand");
  const resultOperandEl = document.getElementById("resultOperand");
  const operatorEl = document.querySelector(".operator");

  const answerInput = document.getElementById("answerInput");
  const submitButton = document.getElementById("submitButton");
  const skipButton = document.getElementById("skipButton");
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");

  const maxTableSelect = document.getElementById("maxTable");
  const modeSelect = document.getElementById("mode");
  const baseTableSelect = document.getElementById("baseTable");
  const algebraDifficultySelect = document.getElementById("algebraDifficulty");

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
  const questionAreaEl = document.querySelector(".question-area");
  const questionHintEl = document.getElementById("questionHint");

  const modeMultiplicationBtn = document.getElementById("modeMultiplication");
  const modeAlgebraBtn = document.getElementById("modeAlgebra");

  let correct = 0;
  let wrong = 0;
  let streak = 0;
  let currentAnswer = null;
  let lastQuestionKey = "";
  let isRunning = false;
  let timerId = null;
  let remainingMs = 60000; // 60 seconds
  let overlayTimeout = null;
  let gameType = "multiplication"; // 'multiplication' | 'algebra'

  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.innerWidth <= 600;

  // Keep viewport stable on mobile to stop keypad jumps
  function keepViewStable() {
    if (isMobile) {
      window.scrollTo(0, 0);
    }
  }

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

  function clearQuestionState() {
    if (questionAreaEl) {
      questionAreaEl.classList.remove("correct", "wrong");
    }
    if (questionHintEl) {
      questionHintEl.textContent = "";
    }
  }

  // --- Algebra question generator ---
  function generateAlgebraQuestion() {
    const difficulty = algebraDifficultySelect
      ? algebraDifficultySelect.value
      : "easy";

    let allowedOps;
    let maxBase;

    if (difficulty === "easy") {
      allowedOps = ["+"]; // only addition
      maxBase = 10;
    } else if (difficulty === "medium") {
      allowedOps = ["+", "-"];
      maxBase = 20;
    } else {
      allowedOps = ["+", "-", "×"];
      maxBase = 30;
    }

    const op = allowedOps[randInt(0, allowedOps.length - 1)];
    let a, b, c;

    if (op === "+") {
      a = randInt(1, maxBase);
      b = randInt(1, maxBase);
      c = a + b;
    } else if (op === "-") {
      // ensure positive result
      const result = randInt(1, maxBase);
      b = randInt(1, maxBase);
      a = result + b; // a - b = result
      c = result;
    } else {
      // multiplication
      const limit = Math.max(2, Math.floor(maxBase / 2));
      a = randInt(1, limit);
      b = randInt(1, limit);
      c = a * b;
    }

    // positions: 0 = left, 1 = right, 2 = result
    let positions;
    if (difficulty === "easy") {
      positions = [2]; // only hide result
    } else {
      positions = [0, 1, 2];
    }

    const hidePos = positions[randInt(0, positions.length - 1)];
    const letters = ["X", "Y", "Z"];
    const letter = letters[randInt(0, letters.length - 1)];

    let leftDisplay = String(a);
    let rightDisplay = String(b);
    let resultDisplay = String(c);
    let answer;

    if (hidePos === 0) {
      leftDisplay = letter;
      answer = a;
    } else if (hidePos === 1) {
      rightDisplay = letter;
      answer = b;
    } else {
      resultDisplay = letter;
      answer = c;
    }

    const opSymbol = op === "×" ? "×" : op;

    return {
      leftDisplay,
      rightDisplay,
      resultDisplay,
      opSymbol,
      answer,
    };
  }

  function nextQuestion() {
    clearQuestionState();

    if (gameType === "multiplication") {
      const maxTable = parseInt(maxTableSelect.value, 10) || 10;
      const baseVal = parseInt(baseTableSelect && baseTableSelect.value, 10);

      let a, b, key;
      do {
        if (!Number.isNaN(baseVal)) {
          a = baseVal;
          b = randInt(1, maxTable);
        } else {
          a = randInt(2, maxTable);
          b = randInt(1, maxTable);
        }
        key = `${a}x${b}`;
      } while (key === lastQuestionKey);

      lastQuestionKey = key;
      currentAnswer = a * b;

      leftOperandEl.textContent = a;
      rightOperandEl.textContent = b;
      if (operatorEl) operatorEl.textContent = "×";
      if (resultOperandEl) resultOperandEl.textContent = "";

    } else {
      // Algebra
      const q = generateAlgebraQuestion();
      currentAnswer = q.answer;

      leftOperandEl.textContent = q.leftDisplay;
      rightOperandEl.textContent = q.rightDisplay;
      if (resultOperandEl) resultOperandEl.textContent = q.resultDisplay;
      if (operatorEl) operatorEl.textContent = q.opSymbol;
    }

    answerInput.value = "";
    if (!isMobile) {
      answerInput.focus();
    } else {
      answerInput.blur();
    }
    setFeedback("Type your answer or use the keypad, then press Enter or Check.");
    keepViewStable();
  }

  function handleCorrect() {
    correct += 1;
    streak += 1;
    setFeedback("Nice! ✅", "correct");
    flashResult("correct");
    playSuccessSound();
    vibrate(60);

    if (questionAreaEl) {
      questionAreaEl.classList.remove("wrong");
      questionAreaEl.classList.add("correct");
    }
    if (questionHintEl) {
      questionHintEl.textContent = "Correct!";
    }

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

    if (questionAreaEl) {
      questionAreaEl.classList.remove("correct");
      questionAreaEl.classList.add("wrong");
    }
    if (questionHintEl) {
      questionHintEl.textContent = `Correct answer is ${currentAnswer}`;
    }

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
      handleCorrect(value);
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
        if (keypadEl) keypadEl.classList.remove("keypad-visible");
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
    clearQuestionState();

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
    clearQuestionState();

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
    keepViewStable();

    if (gameType === "algebra") {
      setFeedback("Algebra mode started. Solve for the missing value! 🎯");
    } else {
      setFeedback("Game started. Good luck! 🎯");
    }

    nextQuestion();
  }

  // --- Mode switching ---
  function setGameType(type) {
    if (type === gameType) return;

    // If changing mode while running, reset first
    if (isRunning) {
      resetEverything();
    }

    gameType = type;

    document.body.classList.toggle("algebra-mode", type === "algebra");
    document.body.classList.toggle("multiplication-mode", type === "multiplication");

    modeMultiplicationBtn.classList.toggle("active", type === "multiplication");
    modeAlgebraBtn.classList.toggle("active", type === "algebra");

    // Change start button label
    if (type === "algebra") {
      startButton.textContent = "Play Algebra";
    } else {
      startButton.textContent = "Start";
    }

    clearQuestionState();
    answerInput.value = "";
    setFeedback(
      type === "algebra"
        ? "Pick a difficulty and press Play Algebra."
        : "Press Start to begin."
    );
  }

  // --- Custom keypad handler ---
  if (keypadEl) {
    keypadEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const key = btn.dataset.key;
      if (!key) return;

      playClickSound();
      vibrate(20);

      if (key === "back") {
        answerInput.value = answerInput.value.slice(0, -1);
      } else if (key === "clear") {
        answerInput.value = "";
      } else if (key === "enter") {
        submitAnswer();
      } else {
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
    if (questionAreaEl) {
      questionAreaEl.classList.remove("correct");
      questionAreaEl.classList.add("wrong");
    }
    if (questionHintEl) {
      questionHintEl.textContent = `Skipped. Correct answer is ${currentAnswer}`;
    }
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
    answerInput.blur();
  } else {
    answerInput.removeAttribute("readonly");
    answerInput.setAttribute("inputmode", "numeric");
  }

  // Mode toggle buttons
  modeMultiplicationBtn.addEventListener("click", () => {
    setGameType("multiplication");
  });

  modeAlgebraBtn.addEventListener("click", () => {
    setGameType("algebra");
  });

  // Start in idle state
  updateStats();
  updateTimeDisplay();
  setGameType("multiplication");
  setFeedback("Press Start to begin.");
  clearQuestionState();
})();
