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
  const homeButton = document.getElementById("homeButton");

  const maxTableSelect = document.getElementById("maxTable");
  const modeSelect = document.getElementById("mode");
  const baseTableSelect = document.getElementById("baseTable");
  const algebraDifficultySelect = document.getElementById("algebraDifficulty");
  const questionCountSelect = document.getElementById("questionCount");

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

  // Question session limit (single player)
  let questionsTarget = 10;
  let singleQuestionIndex = 0; // how many questions have been shown in this session

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

  function updateQuestionMeta() {
    if (!questionNumberEl || !scoreCorrectEl || !scoreTotalEl) return;

    if (mpActive) {
      // Multiplayer: show current question index and total mp questions
      const currentIndex = mpQuestionIndex + 1;
      const totalQ = mpQuestions.length || 0;
      questionNumberEl.textContent = String(
        currentIndex <= totalQ ? currentIndex : totalQ
      );
      scoreCorrectEl.textContent = String(correct);
      scoreTotalEl.textContent = String(totalQ);
    } else {
      // Single player: show "3 out of X" where X is chosen questions
      const currentQuestionNumber =
        singleQuestionIndex === 0 ? 0 : singleQuestionIndex;
      questionNumberEl.textContent = String(currentQuestionNumber);
      scoreCorrectEl.textContent = String(correct);
      scoreTotalEl.textContent = String(questionsTarget);
    }
  }

  function updateStats() {
    const total = correct + wrong;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    correctCountEl.textContent = correct;
    wrongCountEl.textContent = wrong;
    streakCountEl.textContent = streak;
    accuracyEl.textContent = `${accuracy}%`;

    updateQuestionMeta();
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

  // choose which position to hide
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

    // If we've already shown all questions, end session
    if (singleQuestionIndex >= questionsTarget) {
      endSinglePlayerSession();
      return;
    }

    // We're about to show a new question
    singleQuestionIndex += 1;
    updateQuestionMeta();

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
    updateQuestionMeta();

    if (!isMobile) {
      answerInput.focus();
    } else {
      answerInput.blur();
    }
    setFeedback("Multiplayer: answer as fast and accurately as you can! 🎯");
    keepViewStable();
  }

  function endSinglePlayerSession() {
    isRunning = false;
    document.body.classList.remove("playing");
    if (keypadEl) keypadEl.classList.remove("keypad-visible");

    const total = questionsTarget;
    const summary = `Session complete! ✅ You answered ${correct} out of ${total} questions correctly. Accuracy: ${accuracyEl.textContent}`;
    setFeedback(summary, "correct");
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

    if (isMultiplayer) {
      mpQuestionIndex += 1;
      showMultiplayerQuestion(mpQuestionIndex);
    } else {
      // Give time for user to read correct answer
      setTimeout(() => {
        clearQuestionState();
        nextSingleQuestion();
      }, 1400);
    }
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
    singleQuestionIndex = 0;
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
    questionsTarget = parseInt(questionCountSelect?.value, 10) || 10;
    singleQuestionIndex = 0;
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
    document.body.classList.remove("multi-lobby");
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

    // Read chosen number of questions
    questionsTarget = parseInt(questionCountSelect?.value, 10) || 10;

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
      document.body.classList.remove("multi-lobby");
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
    document.body.classList.remove("multi-lobby");

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
    showMultiplayerQuestion(mpQuestionIndex);
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

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      // In-page "home": reset and go back to single player
      resetEverything();
      setPlayMode("single");
      setGameType("multiplication");
      setFeedback("Press Start to begin.");
      window.scrollTo(0, 0);
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

    // Host's settings (used by server for first player to join)
    const settings = {
      baseTable: baseTableSelect?.value || "",
      maxTable: parseInt(maxTableSelect?.value, 10) || 10,
    };

    multiplayerStatus.textContent = "Connecting to lobby...";
    socket.emit("joinLobby", { name, settings });
  });

  // Helper to set lobby status text from payload
  function updateLobbyStatusFromPayload({ hostName, selectedBaseTable, message }) {
    if (selectedBaseTable && hostName) {
      multiplayerStatus.textContent = `${hostName} has selected ${selectedBaseTable} times table`;
    } else if (message) {
      multiplayerStatus.textContent = message;
    } else {
      multiplayerStatus.textContent = "Waiting for host to start the game...";
    }
  }

  // --- Socket.IO events ---
  socket.on("connect", () => {
    console.log("Socket connected", socket.id);
  });

  socket.on(
    "lobbyJoined",
    ({ lobbyId, players, remainingSeconds, isHost, hostName, selectedBaseTable }) => {
      mpLobbyId = lobbyId;
      mpInLobby = true;
      mpResultSent = false;

      document.body.classList.add("multi-lobby");

      updateLobbyStatusFromPayload({
        hostName,
        selectedBaseTable,
        message: isHost
          ? "You are host. Your multiplication settings will be used for this game."
          : "Waiting for host to start the game...",
      });

      multiplayerPlayersList.innerHTML = "";
      players.forEach((name) => {
        const li = document.createElement("li");
        li.textContent = `${name} has joined the game`;
        multiplayerPlayersList.appendChild(li);
      });

      startLobbyCountdown(remainingSeconds);
    }
  );

  socket.on(
    "lobbyUpdate",
    ({ lobbyId, players, remainingSeconds, message, hostName, selectedBaseTable }) => {
      if (mpLobbyId && lobbyId !== mpLobbyId) return;
      mpLobbyId = lobbyId;
      mpInLobby = true;

      document.body.classList.add("multi-lobby");

      updateLobbyStatusFromPayload({ hostName, selectedBaseTable, message });

      multiplayerPlayersList.innerHTML = "";
      players.forEach((name) => {
        const li = document.createElement("li");
        li.textContent = `${name} has joined the game`;
        multiplayerPlayersList.appendChild(li);
      });

      if (typeof remainingSeconds === "number") {
        startLobbyCountdown(remainingSeconds);
      }
    }
  );

  socket.on("gameStart", ({ lobbyId, questions }) => {
    mpLobbyId = lobbyId;
    mpInLobby = false;
    document.body.classList.remove("multi-lobby");
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
    document.body.classList.remove("multi-lobby");

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
  questionsTarget = parseInt(questionCountSelect?.value, 10) || 10;
  singleQuestionIndex = 0;
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
* ================
   Reset
   ================ */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
}

/* ================
   Themes
   ================ */

html[data-theme="dark"] {
  --bg-main: radial-gradient(circle at top, #111827 0, #020617 45%, #020617 100%);
  --bg-header: rgba(15, 23, 42, 0.95);
  --bg-card: rgba(15, 23, 42, 0.98);
  --bg-card-soft: rgba(15, 23, 42, 0.9);
  --border-subtle: rgba(148, 163, 184, 0.35);
  --accent: #38bdf8;
  --accent-soft: rgba(56, 189, 248, 0.12);
  --accent-strong: #0ea5e9;
  --text-main: #e5e7eb;
  --text-soft: #9ca3af;
  --danger: #f97373;
  --success: #4ade80;
  --pill-bg: rgba(15, 23, 42, 0.9);
  --overlay-bg: rgba(15, 23, 42, 0.98);
}

html[data-theme="light"] {
  --bg-main: radial-gradient(circle at top, #eff6ff 0, #e5e7eb 50%, #e5e7eb 100%);
  --bg-header: rgba(248, 250, 252, 0.96);
  --bg-card: #f9fafb;
  --bg-card-soft: #f3f4f6;
  --border-subtle: rgba(148, 163, 184, 0.5);
  --accent: #2563eb;
  --accent-soft: rgba(37, 99, 235, 0.12);
  --accent-strong: #1d4ed8;
  --text-main: #0f172a;
  --text-soft: #6b7280;
  --danger: #b91c1c;
  --success: #16a34a;
  --pill-bg: #e5e7eb;
  --overlay-bg: #ffffff;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg-main);
  color: var(--text-main);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.hidden {
  display: none !important;
}

/* ================
   Header
   ================ */
.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent-strong);
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.7);
}

.logo-text {
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--text-soft);
}

/* Theme toggle button */
.contrast-toggle {
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card-soft);
  color: var(--text-soft);
  padding: 0.25rem 0.6rem;
  font-size: 0.7rem;
  cursor: pointer;
  text-transform: uppercase;
}

/* ================
   Main layout
   ================ */
.app-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.card {
  background: var(--bg-card);
  border-radius: 1.5rem;
  border: 1px solid var(--border-subtle);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
}

.game-card {
  width: 100%;
  max-width: 520px;
  padding: 1.75rem 1.5rem 1.5rem;
}

/* Title */
.game-title {
  font-size: 1.35rem;
  margin: 0 0 0.9rem 0;
  text-align: center;
}

/* ================
   Play mode toggle (single vs multi)
   ================ */
.playmode-toggle {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card-soft);
  margin: 0 auto 0.6rem;
  width: fit-content;
}

.mode-btn {
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 0.8rem;
  padding: 0.25rem 0.8rem;
  border-radius: 999px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Dark mode: white text on toggles */
html[data-theme="dark"] .mode-btn {
  color: #e5e7eb;
}

.mode-btn.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
  border: 1px solid var(--accent);
}

/* ================
   Multiplayer controls
   ================ */
.multiplayer-controls {
  border-radius: 1rem;
  border: 1px dashed var(--border-subtle);
  background: var(--bg-card-soft);
  padding: 0.6rem 0.7rem;
  margin-bottom: 0.7rem;
  font-size: 0.8rem;
}

.mp-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.4rem;
}

.mp-name-label {
  font-size: 0.8rem;
  color: var(--text-soft);
  white-space: nowrap;
}

.mp-name-input {
  flex: 1;
  min-width: 0;
}

.mp-join-btn {
  width: 100%;
  margin-bottom: 0.4rem;
}

.multiplayer-status {
  color: var(--text-soft);
  margin-bottom: 0.25rem;
}

/* Lobby countdown – bright digital style */
.mp-countdown {
  font-family: "DS-Digital", "Courier New", ui-monospace, SFMono-Regular,
    Menlo, Monaco, Consolas, "Liberation Mono", "Lucida Console", monospace;
  font-size: 1.6rem;
  font-weight: 700;
  color: #ff3b3b;
  margin-bottom: 0.35rem;
  text-align: center;
  letter-spacing: 0.08em;
  text-shadow: 0 0 8px rgba(255, 59, 59, 0.6);
}

.multiplayer-players-list {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  align-items: flex-start;
}

.multiplayer-players-list li {
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--pill-bg);
  border: 1px solid var(--border-subtle);
  font-size: 0.75rem;
}

/* ================
   Mode toggle (Multiplication vs Algebra)
   ================ */
.mode-toggle {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card-soft);
  margin: 0.6rem auto 0.9rem;
  width: fit-content;
}

/* ================
   Controls row
   ================ */
.controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 120px;
}

.field-label {
  font-size: 0.8rem;
  color: var(--text-soft);
}

.field-input {
  background: var(--bg-card-soft);
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
  padding: 0.45rem 0.85rem;
  font-size: 0.9rem;
  outline: none;
}

.field-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.45);
}

.field-buttons {
  flex-direction: row;
  gap: 0.5rem;
}

/* Show/hide based on single / multi mode */
.single-only {
  display: flex;
}

body.multi-play .single-only {
  display: none !important;
}

/* Show/hide controls based on multiplication vs algebra */
.multi-only {
  display: flex;
}

.algebra-only {
  display: none;
}

body.algebra-mode .multi-only {
  display: none;
}

body.algebra-mode .algebra-only {
  display: flex;
}

/* ================
   Timer
   ================ */
.timed-info {
  text-align: center;
  margin-bottom: 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.timer-label {
  font-size: 0.8rem;
  color: var(--text-soft);
}

.timer-display {
  font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco,
    Consolas, "Liberation Mono", "Lucida Console", monospace;
  font-size: 1.2rem;
  padding: 0.2rem 0.7rem;
  border-radius: 0.5rem;
  background: #111827;
  color: #f87171;
  letter-spacing: 0.08em;
  min-width: 120px;
  text-align: center;
  border: 1px solid rgba(248, 113, 113, 0.4);
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.3);
}

/* ================
   Question area
   ================ */
/* Hidden by default; only show when game is playing */
.question-area {
  display: none;
  background: var(--bg-card-soft);
  border-radius: 1.25rem;
  padding: 1.1rem 1rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  margin-bottom: 0.6rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease,
    background-color 0.15s ease;
  min-height: 120px;
}

body.playing .question-area {
  display: block;
}

.question-area.correct {
  border-color: var(--success);
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.35);
}

.question-area.wrong {
  border-color: var(--danger);
  box-shadow: 0 0 12px rgba(248, 113, 113, 0.35);
  background-color: rgba(127, 29, 29, 0.35);
}

/* Question meta pill */
.question-meta-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  padding: 0.15rem 0.7rem;
  border-radius: 999px;
  background: var(--pill-bg);
  border: 1px solid rgba(148, 163, 184, 0.6);
  margin: 0 auto 0.4rem;
}

.dot-separator {
  opacity: 0.7;
}

.question-pill {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.4rem;
  font-size: 1.8rem;
  font-weight: 600;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  background: radial-gradient(circle at top, var(--accent-soft), transparent 70%);
  margin: 0 auto 0.4rem;
}

.operator,
.equals {
  color: var(--accent-strong);
}

/* Result operand (only visible in algebra mode) */
.result-operand {
  min-width: 1.5ch;
  text-align: center;
}

body.multiplication-mode .result-operand {
  display: none;
}

body.algebra-mode .result-operand {
  display: inline-block;
}

/* Hint below question */
.question-hint {
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-soft);
  min-height: 1.1rem;
}

/* Answer BELOW question */
.answer-wrapper {
  margin-top: 0.5rem;
  text-align: center;
}

.answer-input-below {
  width: 80%;
  max-width: 300px;
  font-size: 2.4rem;
  font-weight: 700;
  padding: 0.6rem 0.8rem;
  border-radius: 1rem;
  border: 2px solid var(--accent);
  background: #0f172a;
  color: #f9fafb;
  text-align: center;
  outline: none;
}

/* Light theme override for answer box */
html[data-theme="light"] .answer-input-below {
  background: #ffffff;
  color: #0f172a;
}

/* ================
   Buttons
   ================ */
.button-row {
  display: none;
  gap: 0.5rem;
  justify-content: center;
  margin-bottom: 0.5rem;
}

body.playing .button-row {
  display: flex;
}

.btn {
  border-radius: 999px;
  border: 1px solid transparent;
  padding: 0.45rem 0.9rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 90px;
}

.btn.primary {
  background: linear-gradient(135deg, #0f766e, #22c55e);
  color: #ecfdf3;
  border-color: rgba(16, 185, 129, 0.7);
}

.btn.primary:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.btn.ghost {
  background: transparent;
  border-color: var(--border-subtle);
  color: var(--text-soft);
}

.btn.ghost:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
}

/* Stop button */
.btn.danger {
  background: linear-gradient(135deg, #b91c1c, #ef4444);
  color: #fee2e2;
  border-color: rgba(239, 68, 68, 0.6);
}

.btn.danger:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

/* ================
   Feedback + stats
   ================ */
.feedback {
  text-align: center;
  font-size: 0.9rem;
  margin-top: 0.6rem;
  min-height: 1.2rem;
}

.feedback.correct {
  color: var(--success);
}

.feedback.wrong {
  color: var(--danger);
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: center;
  margin-top: 0.7rem;
  font-size: 0.8rem;
}

.stat-pill {
  background: var(--pill-bg);
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
}

/* You said the 4 stats pills are not needed visually */
.stats {
  display: none !important;
}

/* Home button – only for lobby view */
.home-btn {
  display: none;
  margin-top: 0.8rem;
  width: 100%;
}

/* ================
   Big tick / cross overlay
   ================ */
.result-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 50;
}

.result-icon {
  font-size: 5rem;
  font-weight: 700;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.15s ease, transform 0.15s ease;
  text-shadow: 0 0 18px rgba(0, 0, 0, 0.8);
}

.result-icon.show {
  opacity: 1;
  transform: scale(1);
}

.result-icon.correct-flash {
  color: var(--success);
}

.result-icon.wrong-flash {
  color: var(--danger);
}

/* ================
   Keypad
   ================ */
.keypad {
  margin: 0.6rem auto 0.6rem;
  max-width: 360px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  opacity: 0;
  transform: translateY(30px);
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.25s ease, transform 0.25s ease, max-height 0.25s ease;
}

/* Slide-up visible state */
.keypad.keypad-visible {
  opacity: 1;
  transform: translateY(0);
  max-height: 400px;
}

.keypad button {
  border-radius: 0.9rem;
  border: 1px solid var(--border-subtle);
  background: #020617;
  color: #f9fafb;
  font-size: 1.4rem;
  font-weight: 600;
  padding: 0.65rem 0;
  cursor: pointer;
  transition: background 0.12s ease, transform 0.1s ease, box-shadow 0.1s ease;
}

/* Light mode keypad */
html[data-theme="light"] .keypad button {
  background: #e5e7eb;
  color: #0f172a;
}

.keypad button:active {
  transform: translateY(1px);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

.keypad-func {
  font-size: 0.9rem;
}

.keypad-enter {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #0f766e, #22c55e);
  border-color: rgba(16, 185, 129, 0.7);
}

/* ================
   Leaderboard overlay
   ================ */
.leaderboard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}

.leaderboard-card {
  background: var(--overlay-bg);
  color: var(--text-main);
  border-radius: 1.5rem;
  padding: 1.2rem 1.4rem 1rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45);
  border: 1px solid var(--border-subtle);
}

.leaderboard-title {
  margin: 0 0 0.75rem;
  text-align: center;
}

.leaderboard-content {
  max-height: 260px;
  overflow-y: auto;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
}

.leaderboard-table th,
.leaderboard-table td {
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.4);
  text-align: left;
  font-size: 0.8rem;
}

.leaderboard-table th {
  font-weight: 600;
}

.leaderboard-table tr:nth-child(1) td {
  font-weight: 700;
}

.lb-close-btn {
  width: 100%;
}

/* ================
   MINIMAL PLAYING UI (all devices)
   ================ */
/* When the game is running, hide all the top controls everywhere
   so you basically see: question area + answer pill + keypad + bottom buttons */
body.playing .app-header,
body.playing .game-title,
body.playing .feedback,
body.playing .stats,
body.playing .timed-info,
body.playing .mode-toggle,
body.playing .playmode-toggle,
body.playing .multiplayer-controls,
body.playing .controls-row {
  display: none;
}

/* Lobby layout: hide everything below multiplayer pill while waiting */
body.multi-lobby .mode-toggle,
body.multi-lobby .controls-row,
body.multi-lobby .timed-info,
body.multi-lobby .question-area,
body.multi-lobby .keypad,
body.multi-lobby .button-row,
body.multi-lobby .feedback,
body.multi-lobby .stats {
  display: none !important;
}

/* Show Home button in lobby */
body.multi-lobby .home-btn {
  display: inline-flex;
}

/* Hide Home button during active play */
body.playing .home-btn {
  display: none !important;
}

/* Allow scrolling so buttons are never cut off */
body.playing {
  overflow-y: auto;
}

/* ================
   Mobile tweaks
   ================ */
@media (max-width: 600px) {
  .app-main {
    align-items: stretch;
    padding: 0.75rem;
  }

  .game-card {
    padding: 1.25rem 1rem 1rem;
    border-radius: 1.25rem;
  }

  .game-title {
    font-size: 1.2rem;
    margin-bottom: 0.75rem;
  }

  .question-pill {
    font-size: 1.6rem;
  }

  .answer-input-below {
    font-size: 1.6rem;
    padding: 0.45rem 0.6rem;
    border-width: 2px;
    max-width: 220px;
  }

  .keypad button {
    font-size: 1.5rem;
    padding: 0.75rem 0;
  }

  body.playing .question-area {
    margin-top: 0.25rem;
  }
}
