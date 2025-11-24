const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// Catch-all route for SPA
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- Multiplayer lobby state ----
let currentLobby = null;
let lobbyTimer = null;
let lobbyTicker = null;

const LOBBY_DURATION_SEC = 30;
const MP_QUESTION_COUNT = 10;

// Helpers
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearLobbyTimers() {
  if (lobbyTimer) {
    clearTimeout(lobbyTimer);
    lobbyTimer = null;
  }
  if (lobbyTicker) {
    clearInterval(lobbyTicker);
    lobbyTicker = null;
  }
}

function generateMultiplicationQuestions(settings) {
  const maxTable = Number(settings.maxTable) || 10;
  const baseValRaw = settings.baseTable;
  const baseVal = Number(baseValRaw);
  const useBase =
    !Number.isNaN(baseVal) && baseVal >= 2 && baseVal <= 25;

  const questions = [];
  let lastKey = null;

  for (let i = 0; i < MP_QUESTION_COUNT; i++) {
    let a, b, key;
    let tries = 0;
    do {
      if (useBase) {
        a = baseVal;
        b = randInt(1, maxTable);
      } else {
        a = randInt(2, maxTable);
        b = randInt(1, maxTable);
      }
      key = `${a}x${b}`;
      tries += 1;
    } while (key === lastKey && tries < 10);

    lastKey = key;
    questions.push({ a, b, op: "×" });
  }
  return questions;
}

function startGame(lobby) {
  if (!lobby || lobby.started) return;

  lobby.started = true;
  clearLobbyTimers();

  const questions = generateMultiplicationQuestions(lobby.hostSettings);

  // Notify all players
  const payload = {
    lobbyId: lobby.id,
    questions,
  };

  lobby.players.forEach((p) => {
    io.to(p.id).emit("gameStart", payload);
  });
}

function buildLobbyInfo(lobby) {
  const hostPlayer =
    lobby.players.find((p) => p.id === lobby.hostId) || null;
  const hostName = hostPlayer ? hostPlayer.name : lobby.hostName || "Host";

  const selectedBaseTable = lobby.hostSettings?.baseTable
    ? Number(lobby.hostSettings.baseTable)
    : null;

  let message = "Waiting for other players to join...";
  if (selectedBaseTable && hostName) {
    message = `${hostName} has selected ${selectedBaseTable} times table`;
  }

  return { hostName, selectedBaseTable, message };
}

function scheduleLobbyStart(lobby) {
  // When lobby is created, schedule automatic start after N seconds
  clearLobbyTimers();

  lobby.endsAt = Date.now() + LOBBY_DURATION_SEC * 1000;

  // Countdown ticker
  lobbyTicker = setInterval(() => {
    if (!currentLobby || currentLobby.id !== lobby.id) {
      clearLobbyTimers();
      return;
    }
    const remainingMs = lobby.endsAt - Date.now();
    const remainingSeconds = Math.max(
      0,
      Math.ceil(remainingMs / 1000)
    );

    const { hostName, selectedBaseTable, message } = buildLobbyInfo(lobby);

    const updatePayload = {
      lobbyId: lobby.id,
      players: lobby.players.map((p) => p.name),
      remainingSeconds,
      message,
      hostName,
      selectedBaseTable,
    };

    lobby.players.forEach((p) => {
      io.to(p.id).emit("lobbyUpdate", updatePayload);
    });

    if (remainingSeconds <= 0) {
      clearLobbyTimers();
    }
  }, 1000);

  // Start game after countdown
  lobbyTimer = setTimeout(() => {
    if (!currentLobby || currentLobby.id !== lobby.id) return;
    startGame(lobby);
    clearLobbyTimers();
  }, LOBBY_DURATION_SEC * 1000);
}

function createLobby(socketId, hostName, hostSettings) {
  const lobbyId = Date.now().toString(36);
  const lobby = {
    id: lobbyId,
    hostId: socketId,
    hostName: hostName,
    hostSettings: hostSettings || { baseTable: "", maxTable: 10 },
    players: [{ id: socketId, name: hostName }],
    results: [],
    started: false,
    endsAt: null,
  };
  currentLobby = lobby;
  scheduleLobbyStart(lobby);
  return lobby;
}

function destroyLobbyIfEmpty() {
  if (!currentLobby) return;
  if (currentLobby.players.length === 0) {
    clearLobbyTimers();
    currentLobby = null;
  }
}

// ---- Socket.IO handlers ----
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("joinLobby", ({ name, settings }) => {
    const playerName = name || "Player";

    // If no lobby or lobby already started, create a new lobby (this player is host)
    if (!currentLobby || currentLobby.started) {
      const hostSettings = {
        baseTable: settings?.baseTable || "",
        maxTable: Number(settings?.maxTable) || 10,
      };
      const lobby = createLobby(socket.id, playerName, hostSettings);

      const remainingSeconds = Math.max(
        0,
        Math.ceil((lobby.endsAt - Date.now()) / 1000)
      );

      const { hostName, selectedBaseTable, message } = buildLobbyInfo(lobby);

      const payload = {
        lobbyId: lobby.id,
        players: lobby.players.map((p) => p.name),
        remainingSeconds,
        isHost: true,
        hostName,
        selectedBaseTable,
        message,
      };

      socket.emit("lobbyJoined", payload);
      console.log(
        `New lobby ${lobby.id} created by host ${playerName} (${socket.id})`,
        hostSettings
      );
      return;
    }

    // Join existing lobby (non-host)
    const lobby = currentLobby;
    lobby.players.push({ id: socket.id, name: playerName });

    const remainingSeconds = lobby.endsAt
      ? Math.max(0, Math.ceil((lobby.endsAt - Date.now()) / 1000))
      : 0;

    const { hostName, selectedBaseTable, message } = buildLobbyInfo(lobby);

    // Notify this player
    socket.emit("lobbyJoined", {
      lobbyId: lobby.id,
      players: lobby.players.map((p) => p.name),
      remainingSeconds,
      isHost: false,
      hostName,
      selectedBaseTable,
      message,
    });

    // Notify everyone else
    const updatePayload = {
      lobbyId: lobby.id,
      players: lobby.players.map((p) => p.name),
      remainingSeconds,
      message,
      hostName,
      selectedBaseTable,
    };
    lobby.players.forEach((p) => {
      io.to(p.id).emit("lobbyUpdate", updatePayload);
    });

    console.log(
      `Player ${playerName} (${socket.id}) joined lobby ${lobby.id}`
    );
  });

  socket.on("playerResult", ({ lobbyId, correct, wrong, timeMs }) => {
    if (!currentLobby || currentLobby.id !== lobbyId) return;
    const lobby = currentLobby;

    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player) return;

    // Check if we already have a result for this player
    const existing = lobby.results.find((r) => r.id === socket.id);
    if (existing) return;

    lobby.results.push({
      id: socket.id,
      name: player.name,
      correct: Number(correct) || 0,
      wrong: Number(wrong) || 0,
      timeMs: typeof timeMs === "number" ? timeMs : null,
    });

    console.log(
      `Result received from ${player.name} in lobby ${lobby.id}:`,
      correct,
      wrong,
      timeMs
    );

    // When all players submitted, send leaderboard and clear lobby
    if (lobby.results.length === lobby.players.length) {
      const sorted = [...lobby.results].sort((a, b) => {
        // Sort by: correct desc, time asc, wrong asc
        if (b.correct !== a.correct) return b.correct - a.correct;
        if (a.timeMs !== null && b.timeMs !== null && a.timeMs !== b.timeMs) {
          return a.timeMs - b.timeMs;
        }
        return a.wrong - b.wrong;
      });

      const leaderboardPayload = {
        lobbyId: lobby.id,
        players: sorted.map((r) => ({
          name: r.name,
          results: {
            correct: r.correct,
            wrong: r.wrong,
            timeMs: r.timeMs,
          },
        })),
      };

      lobby.players.forEach((p) => {
        io.to(p.id).emit("leaderboard", leaderboardPayload);
      });

      console.log(`Leaderboard sent for lobby ${lobby.id}`);
      clearLobbyTimers();
      currentLobby = null;
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    if (!currentLobby) return;
    const lobby = currentLobby;

    const idx = lobby.players.findIndex((p) => p.id === socket.id);
    if (idx !== -1) {
      const [removed] = lobby.players.splice(idx, 1);
      console.log(`Player ${removed.name} left lobby ${lobby.id}`);

      // If lobby still active and not started yet, update others
      if (!lobby.started && lobby.players.length > 0) {
        const remainingSeconds = lobby.endsAt
          ? Math.max(0, Math.ceil((lobby.endsAt - Date.now()) / 1000))
          : 0;

        const { hostName, selectedBaseTable, message } = buildLobbyInfo(lobby);

        const updatePayload = {
          lobbyId: lobby.id,
          players: lobby.players.map((p) => p.name),
          remainingSeconds,
          message,
          hostName,
          selectedBaseTable,
        };
        lobby.players.forEach((p) => {
          io.to(p.id).emit("lobbyUpdate", updatePayload);
        });
      }

      // Destroy lobby if empty
      destroyLobbyIfEmpty();
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Math game running at http://localhost:${PORT}`);
});
