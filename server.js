// server.js
const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Catch-all route
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Socket.IO setup ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

/**
 * Simple in-memory lobby manager.
 * Each lobby:
 *  - id: string
 *  - createdAt: number
 *  - joinEndsAt: number
 *  - started: boolean
 *  - questions: [{a,b,answer}]
 *  - players: [{socketId, name, results: {correct, wrong, timeMs} | null}]
 *  - finalised: boolean
 */
const lobbies = new Map();
let lobbyCounter = 1;
const LOBBY_JOIN_WINDOW_MS = 30000; // 30 seconds
const MP_QUESTION_COUNT = 15; // number of questions per round

function createLobby() {
  const id = String(lobbyCounter++);
  const now = Date.now();
  const lobby = {
    id,
    createdAt: now,
    joinEndsAt: now + LOBBY_JOIN_WINDOW_MS,
    started: false,
    finalised: false,
    questions: [],
    players: [],
    finishTimeout: null,
  };
  lobbies.set(id, lobby);
  scheduleLobbyStart(lobby);
  return lobby;
}

function findOpenLobby() {
  const now = Date.now();
  for (const lobby of lobbies.values()) {
    if (!lobby.started && lobby.joinEndsAt > now && !lobby.finalised) {
      return lobby;
    }
  }
  return null;
}

function generateQuestions(count = MP_QUESTION_COUNT) {
  const qs = [];
  for (let i = 0; i < count; i++) {
    const a = randInt(2, 12);
    const b = randInt(1, 12);
    qs.push({
      a,
      b,
      answer: a * b,
    });
  }
  return qs;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function scheduleLobbyStart(lobby) {
  const delay = lobby.joinEndsAt - Date.now();
  if (delay <= 0) {
    startLobby(lobby);
    return;
  }
  setTimeout(() => {
    // If lobby already started/finalised, ignore
    if (!lobby.started && !lobby.finalised) {
      startLobby(lobby);
    }
  }, delay);
}

function startLobby(lobby) {
  if (lobby.started || lobby.finalised) return;
  lobby.started = true;
  lobby.questions = generateQuestions(MP_QUESTION_COUNT);

  // Notify players game is starting
  const payload = {
    lobbyId: lobby.id,
    questions: lobby.questions.map((q) => ({
      a: q.a,
      b: q.b,
      op: "×",
    })),
  };

  lobby.players.forEach((p) => {
    io.to(p.socketId).emit("gameStart", payload);
  });

  // After some time, force-finalise lobby so leaderboard is shown
  lobby.finishTimeout = setTimeout(() => {
    finaliseLobbyIfNeeded(lobby.id);
  }, 60000); // 60s for everyone to finish
}

function finaliseLobbyIfNeeded(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby || lobby.finalised) return;
  lobby.finalised = true;

  if (lobby.finishTimeout) {
    clearTimeout(lobby.finishTimeout);
    lobby.finishTimeout = null;
  }

  // Prepare leaderboard
  const playersWithResults = lobby.players
    .map((p) => ({
      name: p.name,
      results: p.results,
    }))
    .filter((p) => p.results);

  // Sort: highest correct, then lowest time
  playersWithResults.sort((a, b) => {
    const ac = a.results.correct;
    const bc = b.results.correct;
    if (bc !== ac) return bc - ac;
    const at = a.results.timeMs ?? Number.MAX_SAFE_INTEGER;
    const bt = b.results.timeMs ?? Number.MAX_SAFE_INTEGER;
    return at - bt;
  });

  // Broadcast leaderboard to all players
  lobby.players.forEach((p) => {
    io.to(p.socketId).emit("leaderboard", {
      lobbyId: lobby.id,
      players: playersWithResults,
    });
  });

  // Optionally clean up lobbies after some time
  setTimeout(() => {
    lobbies.delete(lobbyId);
  }, 5 * 60 * 1000); // 5 minutes
}

// --- Socket.IO events ---
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("joinLobby", ({ name }) => {
    const trimmed = String(name || "").trim();
    const playerName = trimmed || "Player";

    let lobby = findOpenLobby();
    if (!lobby) {
      lobby = createLobby();
    }

    // Attach to socket
    socket.data.lobbyId = lobby.id;
    socket.data.name = playerName;

    // Add to lobby if not already
    if (!lobby.players.some((p) => p.socketId === socket.id)) {
      lobby.players.push({
        socketId: socket.id,
        name: playerName,
        results: null,
      });
    }

    const now = Date.now();
    const remainingSeconds = Math.max(
      0,
      Math.floor((lobby.joinEndsAt - now) / 1000)
    );

    // Notify this player
    socket.emit("lobbyJoined", {
      lobbyId: lobby.id,
      players: lobby.players.map((p) => p.name),
      remainingSeconds,
    });

    // Notify all in lobby about update
    lobby.players.forEach((p) => {
      io.to(p.socketId).emit("lobbyUpdate", {
        lobbyId: lobby.id,
        players: lobby.players.map((pp) => pp.name),
        remainingSeconds,
        message: `${playerName} has joined`,
      });
    });
  });

  socket.on("playerResult", ({ lobbyId, correct, wrong, timeMs }) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.finalised) return;

    const player = lobby.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    player.results = { correct, wrong, timeMs };

    // If all players who joined have submitted results, finalise early
    const allHaveResults = lobby.players.every((p) => p.results);
    if (allHaveResults) {
      finaliseLobbyIfNeeded(lobbyId);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
    const lobbyId = socket.data.lobbyId;
    if (!lobbyId) return;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    // Remove player from lobby
    lobby.players = lobby.players.filter((p) => p.socketId !== socket.id);

    // Notify remaining players
    lobby.players.forEach((p) => {
      io.to(p.socketId).emit("lobbyUpdate", {
        lobbyId: lobby.id,
        players: lobby.players.map((pp) => pp.name),
        remainingSeconds: Math.max(
          0,
          Math.floor((lobby.joinEndsAt - Date.now()) / 1000)
        ),
        message: `${socket.data.name || "Player"} left`,
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`✅ Math game running at http://localhost:${PORT}`);
});
