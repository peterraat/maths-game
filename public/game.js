// public/game.js
(() => {
  // --- DOM elements ---
  const leftOperandEl = document.getElementById("leftOperand");
  const rightOperandEl = document.getElementById("rightOperand");
  const resultOperandEl = document.getElementById("resultOperand");
  const operatorEl = document.querySelector(".operator");

  const answerInput = document.getElementById("answerInput");
  const submitButton = document.getElementById("submitButton");
  const skipButton = document.getElementById("skipButton");
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const mainMenuButton = document.getElementById("mainMenuButton");

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

  const themeToggle = document.getElementById("themeToggle");
  const resultOverlay = document.getElementById("resultOverlay");
  const resultIcon = document.getElementById("resultIcon");
  const questionAreaEl = document.querySelector(".question-area");
  const questionHintEl = document.getElementById("questionHint");

  const modeMultiplicationBtn = document.getElementById("modeMultiplication");
  const modeAlgebraBtn = document.getElementById("modeAlgebra");

  const playModeSingleBtn = document.getElementById("playModeSingle");
  const playModeMultiBtn = document.getElementById("playModeMulti");
  const multiplayerControls = document.getElementById("multiplayerControls");
  const playerNameInput = document.getElementById("playerNameInput");
  const joinMultiplayerButton = document.getElementById("joinMultiplayerButton");
  const multiplayerStatus = document.getElementById("multiplayerStatus");
  const multiplayerPlayersList = document.getElementById("multiplayerPlayers");
  const multiplayerCountdown = document.getElementById("multiplayerCountdown");

  const leaderboardOverlay = document.getElementById("leaderboardOverlay");
  const leaderboardContent = document.getElementById("leaderboardContent");
  const leaderboardClose = document.getElementById("leaderboardClose");

  // Question meta pill elements
  const questionNumberEl = document.getElementById("questionNumber");
  const scoreCorrectEl = document.getElementById("scoreCorrect");
  const scoreTotalEl = document.getElementById("scoreTotal");

  // --- State ---
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
  let playMode = "single"; // 'single' | 'multi'

  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.innerWidth <= 600;

  // Multiplayer
  const socket = io();
  let mpLobbyId = null;
  let mpQuestions = [];
  let mpQuestionIndex = 0;
  let mpInLobby = false;
  let mpActive = false;
  let mpStartTimeMs = null;
  let mpResultSent = false;

  // Lobby countdown (client-side)
  let lobbyCountdownInterval = null;
  let lobbyCountdownSeconds = 0;

  // --- Helpers: keep viewport stable on mobile ---
  function keepViewStable() {
    if (isMobile) {
      window.scrollTo(0, 0);
    }
  }

  function updateLobbyCountdownDisplay() {
    if (!multiplayerCountdown) return;
    if (lobbyCountdownSeconds > 0) {
      multiplayerCountdown.textContent = `${lobbyCountdownSeconds}s`;
    } else {
      multiplayerCountdown.textContent = "";
    }
  }

  function startLobbyCountdown(seconds) {
    if (lobbyCountdownInterval) {
      clearInterval(lobbyCountdownInterval);
      lobbyCountdownInterval = null;
    }
    lobbyCountdownSeconds = seconds;
    updateLobbyCountdownDisplay();

    if (seconds <= 0) return;

    lobbyCountdownInterval = setInterval(() => {
      lobbyCountdownSeconds -= 1;
      if (lobbyCountdownSeconds <= 0) {
        lobbyCountdownSeconds = 0;
        updateLobbyCountdownDisplay();
        clearInterval(lobbyCountdownInterval);
        lobbyCountdownInterval = null;
      } else {
        updateLobbyCountdownDisplay();
      }
    }, 1000);
  }

  function stopLobbyCountdown() {
    if (lobbyCountdownInterval) {
      clearInterval(lobbyCountdownInterval);
      lobbyCountdownInterval = null;
    }
    lobbyCountdownSeconds = 0;
    updateLobbyCountdownDisplay();
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

    // Update question meta pill
    if (questionNumberEl && scoreCorrectEl && scoreTotalEl) {
      questionNumberEl.textContent = String(total);
      scoreCorrectEl.textContent = String(correct);
      scoreTotalEl.textContent = String(total);
    }
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

  // Clear the visible question (for initial state / reset)
  function clearDisplayQuestion() {
    if (leftOperandEl) leftOperandEl.textContent = "";
    if (rightOperandEl) rightOperandEl.textContent = "";
    if (resultOperandEl) resultOperandEl.textContent = "";
  }

  // Build a string like '7 × 8' or 'X + 3 = 9' for messages
  function getCurrentQuestionString() {
    const left = leftOperandEl?.textContent || "?";
    const right = rightOperandEl?.textContent || "?";
    const op = operatorEl?.textContent || "?";
    const result = resultOperandEl?.textContent || "";

    if (gameType === "algebra") {
      const eqRight = result || "?";
      return `${left} ${op} ${right} = ${eqRight}`;
    } else {
      return `${left} ${op} ${right}`;
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

  // --- Question generation (single player) ---
  function nextSingleQuestion() {
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
          a = randInt(2, maxTable); // 2 up to chosen max
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

  // --- Question display (multiplayer) ---
  function showMultiplayerQuestion(index) {
    clearQuestionState();

    const q = mpQuestions[index];
    if (!q) {
      // No more questions
      finishMultiplayerRound();
      return;
    }

    gameType = "multiplication"; // multiplayer is multiplication only
    document.body.classList.add("multiplication-mode");
    document.body.classList.remove("algebra-mode");

    leftOperandEl.textContent = q.a;
    rightOperandEl.textContent = q.b;
    if (operatorEl) operatorEl.textContent = q.op || "×";
    if (resultOperandEl) resultOperandEl.textContent = "";

    currentAnswer = q.a * q.b;

    answerInput.value = "";
    if (!isMobile) {
      answerInput.focus();
    } else {
      answerInput.blur();
    }
    setFeedback("Multiplayer: answer as fast and accurately as you can! 🎯");
    keepViewStable();
  }

  function handleCorrect(isMultiplayer = false) {
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

    if (isMultiplayer) {
      mpQuestionIndex += 1;
      showMultiplayerQuestion(mpQuestionIndex);
    } else {
      nextSingleQuestion();
    }
  }

  function handleWrong(userValue, { reason = "wrong", isMultiplayer = false } = {}) {
    wrong += 1;
    streak = 0;

    const questionString = getCurrentQuestionString();

    if (reason === "skip") {
      setFeedback(`Skipped. The answer was ${currentAnswer}.`, "wrong");
    } else {
      setFeedback(
        `Not quite. You said ${userValue}, correct is ${currentAnswer}.`,
        "wrong"
      );
    }

    flashResult("wrong");
    playFailSound();
    vibrate([40, 40, 40]);

    if (questionAreaEl) {
      questionAreaEl.classList.remove("correct");
      questionAreaEl.classList.add("wrong");
    }
    if (questionHintEl) {
      questionHintEl.textContent = `The correct answer for "${questionString}" is ${currentAnswer}`;
    }

    updateStats();

    // Give time for user to read correct answer
    setTimeout(() => {
      clearQuestionState();
      if (isMultiplayer) {
        mpQuestionIndex += 1;
        showMultiplayerQuestion(mpQuestionIndex);
      } else {
        nextSingleQuestion();
      }
    }, 1400);
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

    const isMultiplayer = playMode === "multi" && mpActive;

    if (value === currentAnswer) {
      handleCorrect(isMultiplayer);
    } else {
      handleWrong(value, { reason: "wrong", isMultiplayer });
    }
  }

  // --- Timer (single-player only) ---
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
    clearDisplayQuestion();

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

    // Reset multiplayer-related state
    mpActive = false;
    mpInLobby = false;
    mpLobbyId = null;
    mpQuestions = [];
    mpQuestionIndex = 0;
    mpStartTimeMs = null;
    mpResultSent = false;
    stopLobbyCountdown();
  }

  function startSinglePlayerGame() {
    if (playMode !== "single") {
      setFeedback("You are in multiplayer mode. Switch to Single Player to use Start.");
      return;
    }

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

    nextSingleQuestion();
  }

  // --- Mode switching: Multiplication vs Algebra ---
  function setGameType(type) {
    if (type === gameType) return;
    gameType = type;

    document.body.classList.toggle(
      "algebra-mode",
      type === "algebra"
    );
    document.body.classList.toggle(
      "multiplication-mode",
      type === "multiplication"
    );

    modeMultiplicationBtn.classList.toggle("active", type === "multiplication");
    modeAlgebraBtn.classList.toggle("active", type === "algebra");

    clearQuestionState();
    clearDisplayQuestion();
    answerInput.value = "";
    setFeedback(
      type === "algebra"
        ? "Pick a difficulty and press Start (single) or Play with others (multi)."
        : "Press Start to begin."
    );
  }

  // --- Play mode: Single vs Multi ---
  function setPlayMode(mode) {
    if (mode === playMode) return;
    playMode = mode;

    document.body.classList.toggle("multi-play", mode === "multi");

    playModeSingleBtn.classList.toggle("active", mode === "single");
    playModeMultiBtn.classList.toggle("active", mode === "multi");

    if (mode === "multi") {
      multiplayerControls.classList.remove("hidden");
      setFeedback("Enter your name and click 'Play with others' to join.");
      timedInfoEl.classList.add("hidden");
      stopTimer();
      remainingMs = 60000;
      updateTimeDisplay();
    } else {
      multiplayerControls.classList.add("hidden");
      multiplayerStatus.textContent = "Multiplayer not started.";
      stopLobbyCountdown();
      multiplayerPlayersList.innerHTML = "";
      mpInLobby = false;
      mpLobbyId = null;
      mpQuestions = [];
      mpQuestionIndex = 0;
      mpStartTimeMs = null;
      mpResultSent = false;
      setFeedback("Press Start to begin.");
    }

    clearQuestionState();
    clearDisplayQuestion();
    answerInput.value = "";
  }

  // --- Multiplayer: starting a round ---
  function startMultiplayerRound(questions, lobbyId) {
    playMode = "multi";
    document.body.classList.add("multi-play");
    document.body.classList.add("playing");

    mpActive = true;
    mpQuestions = questions || [];
    mpQuestionIndex = 0;
    mpLobbyId = lobbyId || mpLobbyId;
    mpStartTimeMs = Date.now();
    mpResultSent = false;

    isRunning = true;
    stopTimer();
    timedInfoEl.classList.add("hidden");
    stopLobbyCountdown();

    if (keypadEl) {
      keypadEl.classList.add("keypad-visible");
    }
    if (isMobile) {
      answerInput.blur();
    } else {
      answerInput.focus();
    }

    setFeedback("Multiplayer started! Everyone is answering the same questions.");
    nextMultiplayerQuestion();
  }

  function nextMultiplayerQuestion() {
    const qIndex = mpQuestionIndex;
    const q = mpQuestions[qIndex];
    if (!q) {
      finishMultiplayerRound();
      return;
    }

    clearQuestionState();

    gameType = "multiplication";
    document.body.classList.add("multiplication-mode");
    document.body.classList.remove("algebra-mode");

    leftOperandEl.textContent = q.a;
    rightOperandEl.textContent = q.b;
    if (operatorEl) operatorEl.textContent = q.op || "×";
    if (resultOperandEl) resultOperandEl.textContent = "";

    currentAnswer = q.a * q.b;
    answerInput.value = "";

    const total = correct + wrong;
    if (questionNumberEl && scoreCorrectEl && scoreTotalEl) {
      questionNumberEl.textContent = String(total);
      scoreCorrectEl.textContent = String(correct);
      scoreTotalEl.textContent = String(total);
    }

    if (!isMobile) {
      answerInput.focus();
    } else {
      answerInput.blur();
    }
    setFeedback("Multiplayer: answer as fast and accurately as you can! 🎯");
    keepViewStable();
  }

  function finishMultiplayerRound() {
    // Always send result once per lobby if we have one
    if (!mpLobbyId || mpResultSent) return;

    mpActive = false;
    isRunning = false;
    document.body.classList.remove("playing");

    const timeMs = mpStartTimeMs ? Date.now() - mpStartTimeMs : null;

    mpResultSent = true;
    setFeedback("Waiting for other players to finish...");

    socket.emit("playerResult", {
      lobbyId: mpLobbyId,
      correct,
      wrong,
      timeMs,
    });
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
        // 0-9
        answerInput.value += key;
      }
    });
  }

  // --- Theme toggle: Dark / Light ---
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const html = document.documentElement;
      const current = html.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
    });
  }

  // --- Event listeners: single player + multi ---
  startButton?.addEventListener("click", () => {
    startSinglePlayerGame();
  });

  stopButton?.addEventListener("click", () => {
    // In multiplayer, Stop submits your result instead of silently wiping
    if (playMode === "multi" && mpActive && mpLobbyId) {
      finishMultiplayerRound();
    } else {
      resetEverything();
    }
  });

  if (mainMenuButton) {
    mainMenuButton.addEventListener("click", () => {
      resetEverything();
      setPlayMode("single");
      setGameType("multiplication");
      setFeedback("Press Start (single) or switch to Multiplayer to join a game.");
    });
  }

  submitButton.addEventListener("click", () => {
    submitAnswer();
  });

  skipButton.addEventListener("click", () => {
    if (!isRunning) return;
    const isMultiplayer = playMode === "multi" && mpActive;
    handleWrong("skipped", { reason: "skip", isMultiplayer });
  });

  // Answer input Enter (single + multi)
  answerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAnswer();
    }
  });

  // FIX double key bug: window listener ONLY handles Enter, not digits
  window.addEventListener("keydown", (e) => {
    if (!isRunning) return;
    if (e.key === "Enter") {
      e.preventDefault();
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

  // --- Mode toggle buttons (Multiplication / Algebra) ---
  modeMultiplicationBtn.addEventListener("click", () => {
    setGameType("multiplication");
  });

  modeAlgebraBtn.addEventListener("click", () => {
    setGameType("algebra");
  });

  // --- Play mode toggle buttons (Single / Multi) ---
  playModeSingleBtn.addEventListener("click", () => {
    setPlayMode("single");
  });

  playModeMultiBtn.addEventListener("click", () => {
    setPlayMode("multi");
  });

  // --- Multiplayer: join button ---
  joinMultiplayerButton.addEventListener("click", () => {
    setPlayMode("multi");
    const name = (playerNameInput.value || "").trim() || "Player";
    multiplayerStatus.textContent = "Connecting to lobby...";
    socket.emit("joinLobby", { name });
  });

  // --- Socket.IO events ---
  socket.on("connect", () => {
    console.log("Socket connected", socket.id);
  });

  socket.on("lobbyJoined", ({ lobbyId, players, remainingSeconds }) => {
    mpLobbyId = lobbyId;
    mpInLobby = true;
    mpResultSent = false;

    multiplayerStatus.textContent = "Waiting for other players to join...";
    multiplayerPlayersList.innerHTML = "";
    players.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      multiplayerPlayersList.appendChild(li);
    });

    startLobbyCountdown(remainingSeconds);
  });

  socket.on("lobbyUpdate", ({ lobbyId, players, remainingSeconds, message }) => {
    if (mpLobbyId && lobbyId !== mpLobbyId) return;
    mpLobbyId = lobbyId;

    multiplayerStatus.textContent =
      message || "Waiting for other players to join...";
    multiplayerPlayersList.innerHTML = "";
    players.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      multiplayerPlayersList.appendChild(li);
    });

    if (typeof remainingSeconds === "number") {
      startLobbyCountdown(remainingSeconds);
    }
  });

  socket.on("gameStart", ({ lobbyId, questions }) => {
    mpLobbyId = lobbyId;
    mpInLobby = false;
    multiplayerStatus.textContent = "Game started!";
    stopLobbyCountdown();
    resetGameState();
    startMultiplayerRound(questions, lobbyId);
  });

  socket.on("leaderboard", ({ lobbyId, players }) => {
    if (!mpLobbyId || lobbyId !== mpLobbyId) return;

    mpActive = false;
    isRunning = false;
    document.body.classList.remove("playing");

    multiplayerStatus.textContent = "Game finished. Showing leaderboard.";

    // Build leaderboard HTML
    if (!players || players.length === 0) {
      leaderboardContent.innerHTML = `<p>No results submitted.</p>`;
    } else {
      const rows = players
        .map((p, index) => {
          const pos = index + 1;
          const name = p.name || "Player";
          const correct = p.results?.correct ?? 0;
          const wrong = p.results?.wrong ?? 0;
          const timeMs = p.results?.timeMs ?? null;
          const timeStr = timeMs ? (timeMs / 1000).toFixed(1) + "s" : "-";

          return `
            <tr>
              <td>${pos}</td>
              <td>${name}</td>
              <td>${correct}</td>
              <td>${wrong}</td>
              <td>${timeStr}</td>
            </tr>
          `;
        })
        .join("");

      leaderboardContent.innerHTML = `
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Correct</th>
              <th>Wrong</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    }

    leaderboardOverlay.classList.remove("hidden");
  });

  leaderboardClose.addEventListener("click", () => {
    leaderboardOverlay.classList.add("hidden");
    resetEverything();
  });

  // --- Initial state ---
  updateStats();
  remainingMs = 60000;
  updateTimeDisplay();
  document.documentElement.setAttribute("data-theme", "dark");
  document.body.classList.add("multiplication-mode");
  setGameType("multiplication");
  setPlayMode("single");
  clearDisplayQuestion();
  setFeedback("Press Start to begin.");
  clearQuestionState();
})();
