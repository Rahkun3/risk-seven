#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const root = path.join(__dirname, "..");
const js = path.join(root, "js");
require(path.join(js, "cards.js"));
const { Game } = require(path.join(js, "engine.js"));
const AI = require(path.join(js, "ai.js"));
const looks = require(path.join(js, "looks.js"));
const T = require("./table");

const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "0.0.0.0";
const GRACE_MS = Number(process.env.RECONNECT_MS || 20000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const rooms = new Map();
const clients = new Map();
const sessions = new Map();
let publicUrl = String(process.env.PUBLIC_URL || "").replace(/\/$/, "");

function lanIP() {
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "127.0.0.1";
}

function nid() {
  return crypto.randomBytes(4).toString("hex");
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return rooms.has(s) ? makeCode() : s;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function pubSnap(snap) {
  const copy = Object.assign({}, snap);
  delete copy.remaining;
  delete copy.discard;
  delete copy.fullLog;
  return copy;
}

function eachClient(room, fn) {
  const ids = T.humansOf(room)
    .map((s) => s.id)
    .concat(room.watchers.map((w) => w.id));
  const seen = new Set();
  ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const c = clients.get(id);
    if (c && c.ws) fn(c.ws, id);
  });
}

function broadcastLobby(room) {
  const view = T.roomView(room);
  eachClient(room, (ws) => send(ws, { type: "lobby", room: view }));
}

function broadcastSnap(room, snap) {
  const pub = pubSnap(snap);
  eachClient(room, (ws, id) => {
    const seated = room.seats.some((s) => s.id === id && s.kind === "human");
    send(ws, { type: "snap", snap: pub, youId: id, role: seated ? "player" : "spectate" });
  });
}

function broadcast(room, msg) {
  eachClient(room, (ws) => send(ws, msg));
}

function findClientRoom(id) {
  for (const room of rooms.values()) {
    if (room.seats.some((s) => s.id === id) || room.watchers.some((w) => w.id === id)) return room;
  }
  return null;
}

function helloPayload(youId) {
  return {
    type: "hello",
    youId,
    publicUrl,
    lanUrl: "http://" + lanIP() + ":" + PORT,
  };
}

function sendRoomState(ws, id) {
  const room = findClientRoom(id);
  if (!room) return;
  const seated = room.seats.some((s) => s.id === id);
  const role = seated && room.seats.some((s) => s.id === id && s.kind === "human") ? "player" : "spectate";
  send(ws, { type: "joined", youId: id, role, room: T.roomView(room) });
  if (room.playing && room.game) {
    send(ws, {
      type: "snap",
      snap: pubSnap(room.game.snapshot()),
      youId: id,
      role,
    });
  }
}

function destroyRoom(room) {
  if (room.pending) {
    clearTimeout(room.pending.timer);
    room.pending.resolve(room.pending.kind === "hitStay" ? "stay" : null);
    room.pending = null;
  }
  if (room.game) room.game.stop();
  rooms.delete(room.code);
}

function rekeySeat(room, oldId, newId) {
  const seat = room.seats.find((s) => s.id === oldId);
  if (seat) seat.id = newId;
  if (room.game && Array.isArray(room.game.players)) {
    const gp = room.game.players.find((p) => p.id === oldId);
    if (gp) gp.id = newId;
  }
  if (room.pending && room.pending.clientId === oldId) room.pending.clientId = newId;
  if (room.hostId === oldId) room.hostId = newId;
}

function dropClient(id) {
  const c = clients.get(id);
  if (!c || c.alive) return;
  if (c.sessionId && sessions.get(c.sessionId) === id) sessions.delete(c.sessionId);
  clients.delete(id);
}

function maybeDestroy(room) {
  if (T.hasLiveHumans(room)) return false;
  const anyone = room.seats.some((s) => s.kind === "human") || room.watchers.length;
  if (anyone) return false;
  destroyRoom(room);
  return true;
}

function clearPendingIf(room, id) {
  if (room.pending && room.pending.clientId === id) {
    const p = room.pending;
    room.pending = null;
    clearTimeout(p.timer);
    p.resolve(p.kind === "hitStay" ? "stay" : null);
  }
}

function resolvePendingWithAi(room) {
  const p = room.pending;
  if (!p || !room.game) return;
  clearTimeout(p.timer);
  room.pending = null;
  const snap = room.game.snapshot();
  const player = room.game.players.find((x) => x.id === p.clientId);
  if (!player) {
    p.resolve(p.kind === "hitStay" ? "stay" : null);
    return;
  }
  const rng = Math.random;
  if (p.kind === "hitStay") {
    p.resolve(AI.decideHitStay(snap, player, { rng, difficulty: snap.difficulty }));
    return;
  }
  const card = (snap.prompt && snap.prompt.card) || { kind: "freeze" };
  const ids = (snap.prompt && snap.prompt.candidateIds) || [];
  const cands = snap.players.filter((x) => ids.includes(x.id));
  p.resolve(AI.decideTarget(snap, player, card, cands.length ? cands : snap.players, { rng, difficulty: snap.difficulty }));
}

function announce(room, text) {
  broadcast(room, { type: "notice", text });
  if (room.game && typeof room.game.pushLog === "function") {
    room.game.pushLog(text, "system");
  }
}

function finishLeave(id, opts) {
  const rekey = !!(opts && opts.rekey);
  const room = findClientRoom(id);
  if (!room) return;
  const seat = room.seats.find((s) => s.id === id);
  const watcher = room.watchers.find((w) => w.id === id);
  const name = (seat && seat.name) || (watcher && watcher.name) || "A player";
  if (room.playing && seat) {
    T.takeoverAi(room, id);
    if (room.pending && room.pending.clientId === id) resolvePendingWithAi(room);
    if (rekey) rekeySeat(room, id, "stand-" + nid());
    if (!T.humansOf(room).length && !room.watchers.length) {
      destroyRoom(room);
      return;
    }
    if (room.hostId === null) {
      const next = T.humansOf(room)[0];
      room.hostId = next ? next.id : room.hostId;
    }
    announce(room, name + " left the table. An AI is playing that seat.");
    broadcastLobby(room);
    if (room.game) broadcastSnap(room, room.game.snapshot());
    return;
  }
  clearPendingIf(room, id);
  T.leaveSeat(room, id);
  if (maybeDestroy(room)) return;
  announce(room, name + " left the table.");
  broadcastLobby(room);
  if (!room.playing && room.again && room.again.size) {
    const humans = T.humansOf(room);
    if (humans.length && humans.every((h) => room.again.has(h.id))) startMatch(room);
  }
}

function leaveRoom(id, immediate) {
  const c = clients.get(id);
  if (c && c.timer) {
    clearTimeout(c.timer);
    c.timer = null;
  }
  const room = findClientRoom(id);
  if (!room) return;
  const seatedHuman = room.seats.some((s) => s.id === id && s.kind === "human");
  const watching = room.watchers.some((w) => w.id === id);
  if (!immediate && (seatedHuman || watching)) {
    const seat = room.seats.find((s) => s.id === id);
    if (seat) seat.away = true;
    broadcastLobby(room);
    if (c) {
      c.timer = setTimeout(() => {
        c.timer = null;
        finishLeave(id, { rekey: false });
        dropClient(id);
      }, GRACE_MS);
    } else {
      finishLeave(id, { rekey: false });
    }
    return;
  }
  finishLeave(id, { rekey: immediate });
}

function applyProfile(c, msg) {
  if (msg.name) c.name = String(msg.name).slice(0, 16) || "You";
  if (msg.avatar) c.avatar = looks.normalize(msg.avatar);
}

function personFromClient(c) {
  return {
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    kind: "human",
    title: "",
    portrait: looks.src(c.avatar),
  };
}

function bindSession(ws, sessionId) {
  const sid = String(sessionId || "").slice(0, 64);
  if (!sid) return ws.cid;
  const oldId = sessions.get(sid);
  if (oldId && oldId !== ws.cid) {
    const old = clients.get(oldId);
    if (old && !old.alive) {
      if (old.timer) {
        clearTimeout(old.timer);
        old.timer = null;
      }
      clients.delete(ws.cid);
      ws.cid = oldId;
      old.ws = ws;
      old.alive = true;
      old.sessionId = sid;
      sessions.set(sid, oldId);
      return oldId;
    }
  }
  const c = clients.get(ws.cid);
  if (c) c.sessionId = sid;
  sessions.set(sid, ws.cid);
  return ws.cid;
}

function reclaimSeat(id) {
  const c = clients.get(id);
  const room = findClientRoom(id);
  if (!c || !room) return;
  const seat = room.seats.find((s) => s.id === id);
  if (seat) {
    if (seat.kind === "ai") T.restoreHuman(room, id, personFromClient(c));
    else {
      seat.away = false;
      seat.name = c.name;
      seat.avatar = c.avatar;
      seat.portrait = personFromClient(c).portrait;
    }
  }
  broadcastLobby(room);
  if (room.playing && room.game) broadcastSnap(room, room.game.snapshot());
}

function createRoom(ws, msg) {
  const c = clients.get(ws.cid);
  if (!c) return;
  leaveRoom(ws.cid, true);
  const room = T.makeRoom({
    code: makeCode(),
    tableSize: msg.tableSize || T.MAX,
    difficulty: msg.difficulty,
    host: personFromClient(c),
  });
  rooms.set(room.code, room);
  send(ws, { type: "joined", youId: ws.cid, role: "player", room: T.roomView(room) });
}

function joinRoom(ws, msg) {
  const c = clients.get(ws.cid);
  if (!c) return;
  const code = String(msg.code || "").trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(ws, { type: "error", message: "No table with that code." });
    return;
  }
  if (findClientRoom(ws.cid) === room) {
    sendRoomState(ws, ws.cid);
    return;
  }
  leaveRoom(ws.cid, true);
  const role = T.seatHuman(room, personFromClient(c));
  send(ws, { type: "joined", youId: ws.cid, role, room: T.roomView(room) });
  broadcastLobby(room);
  if (room.playing && room.game) broadcastSnap(room, room.game.snapshot());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitClient(room, clientId, kind) {
  return new Promise((resolve) => {
    if (room.pending) {
      clearTimeout(room.pending.timer);
      room.pending.resolve(room.pending.kind === "hitStay" ? "stay" : null);
    }
    const timer = setTimeout(() => {
      if (room.pending && room.pending.clientId === clientId && room.pending.kind === kind) {
        room.pending = null;
        resolve(kind === "hitStay" ? "stay" : null);
      }
    }, 90000);
    room.pending = { clientId, kind, resolve, timer };
  });
}

async function startMatch(room) {
  if (room.playing) return;
  if (room.pending) {
    clearTimeout(room.pending.timer);
    room.pending = null;
  }
  T.promoteWatchers(room);
  if (!T.humansOf(room).length) return;
  T.fillAi(room);
  room.again = new Set();
  const players = T.matchPlayers(room);
  room.playing = true;
  broadcast(room, { type: "match", room: T.roomView(room) });
  const rng = Math.random;
  const game = new Game({
    players,
    goal: 200,
    difficulty: room.difficulty,
    rng,
    animMs: 1200,
    onUpdate: (snap) => broadcastSnap(room, snap),
    askHitStay: async (snap, player) => {
      if (player.kind === "ai") {
        await sleep(AI.thinkMs(player, snap.difficulty));
        const choice = AI.decideHitStay(snap, player, { rng, difficulty: snap.difficulty });
        const line = AI.explainHitStay(snap, player, choice);
        if (line) broadcast(room, { type: "say", playerId: player.id, text: line });
        return choice;
      }
      return waitClient(room, player.id, "hitStay");
    },
    askTarget: async (snap, player, card, candidates) => {
      if (player.kind === "ai") {
        await sleep(AI.thinkMs(player, snap.difficulty));
        const id = AI.decideTarget(snap, player, card, candidates, { rng, difficulty: snap.difficulty });
        const line = AI.explainTarget(snap, player, card, id);
        if (line) broadcast(room, { type: "say", playerId: player.id, text: line });
        return id;
      }
      const picked = await waitClient(room, player.id, "target");
      if (picked && candidates.some((c) => c.id === picked)) return picked;
      return null;
    },
    ackRoundEnd: async (snap) => {
      const max = Math.max(...snap.players.map((p) => p.totalScore));
      const leaders = snap.players.filter((p) => p.totalScore === max);
      if (max >= snap.goal && leaders.length === 1) return;
      await sleep(2400);
    },
  });
  room.game = game;
  try {
    await game.playMatch();
  } catch (err) {
    console.error(err);
  }
  room.playing = false;
  room.game = null;
  if (game.winners && game.winners.length) {
    broadcast(room, { type: "over", winners: game.winners, snap: pubSnap(game.snapshot()) });
  }
  T.promoteWatchers(room);
  T.fillAi(room);
  broadcastLobby(room);
}

function onMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch (e) {
    return;
  }
  const c = clients.get(ws.cid);
  if (!c) return;
  applyProfile(c, msg);

  if (msg.type === "hello") {
    if (msg.sessionId) bindSession(ws, msg.sessionId);
    const live = clients.get(ws.cid);
    if (live) applyProfile(live, msg);
    reclaimSeat(ws.cid);
    send(ws, helloPayload(ws.cid));
    sendRoomState(ws, ws.cid);
    return;
  }
  if (msg.type === "create") {
    createRoom(ws, msg);
    return;
  }
  if (msg.type === "join") {
    joinRoom(ws, msg);
    return;
  }
  if (msg.type === "leave") {
    leaveRoom(ws.cid, true);
    return;
  }
  const room = findClientRoom(ws.cid);
  if (!room) return;
  if (msg.type === "start" && room.hostId === ws.cid && !room.playing) {
    startMatch(room);
    return;
  }
  if (msg.type === "again" && !room.playing) {
    if (!room.again) room.again = new Set();
    room.again.add(ws.cid);
    const humans = T.humansOf(room);
    broadcast(room, {
      type: "votes",
      ids: Array.from(room.again),
      have: humans.filter((h) => room.again.has(h.id)).length,
      need: humans.length,
    });
    if (humans.length && humans.every((h) => room.again.has(h.id))) startMatch(room);
    return;
  }
  if (room.pending && room.pending.clientId === ws.cid) {
    if (msg.type === "hitStay" && room.pending.kind === "hitStay") {
      const choice = msg.choice === "stay" ? "stay" : "hit";
      const p = room.pending;
      room.pending = null;
      clearTimeout(p.timer);
      p.resolve(choice);
    }
    if (msg.type === "target" && room.pending.kind === "target") {
      const p = room.pending;
      room.pending = null;
      clearTimeout(p.timer);
      p.resolve(String(msg.targetId || ""));
    }
  }
}

function isLocalAddr(addr) {
  return addr === "127.0.0.1" || addr === "::1" || addr === ":ffff:127.0.0.1";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function setPublicUrl(url) {
  const next = String(url || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(next)) return false;
  publicUrl = next;
  console.log("  internet  " + publicUrl);
  rooms.forEach((room) => {
    broadcast(room, { type: "info", publicUrl, room: T.roomView(room) });
    broadcastLobby(room);
  });
  return true;
}

async function serve(req, res) {
  const rawUrl = req.url || "/";
  const url = decodeURIComponent(rawUrl.split("?")[0]);
  if (url === "/api/info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        publicUrl,
        lanUrl: "http://" + lanIP() + ":" + PORT,
        localUrl: "http://127.0.0.1:" + PORT,
        port: PORT,
      })
    );
    return;
  }
  if (url === "/api/public" && req.method === "POST") {
    const addr = req.socket.remoteAddress;
    if (!isLocalAddr(addr)) {
      res.writeHead(403);
      res.end("local only");
      return;
    }
    try {
      const body = await readJson(req);
      if (!setPublicUrl(body.url)) {
        res.writeHead(400);
        res.end("bad url");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, publicUrl }));
    } catch (err) {
      res.writeHead(400);
      res.end("bad json");
    }
    return;
  }
  let fileUrl = url === "/" ? "/index.html" : url;
  const file = path.normalize(path.join(root, fileUrl));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file);
    const headers = { "Content-Type": TYPES[ext] || "application/octet-stream" };
    if (ext === ".html" || ext === ".js" || ext === ".css") {
      headers["Cache-Control"] = "no-cache";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  serve(req, res).catch((err) => {
    console.error(err);
    res.writeHead(500);
    res.end("error");
  });
});
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.cid = nid();
  clients.set(ws.cid, { id: ws.cid, ws, name: "You", avatar: "f1", alive: true, timer: null, sessionId: null });
  send(ws, helloPayload(ws.cid));
  const beat = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
    else clearInterval(beat);
  }, 20000);
  ws.on("message", (raw) => onMessage(ws, String(raw)));
  ws.on("close", () => {
    clearInterval(beat);
    const id = ws.cid;
    const c = clients.get(id);
    if (c) {
      c.alive = false;
      c.ws = null;
    }
    if (!findClientRoom(id)) {
      if (c) {
        c.timer = setTimeout(() => dropClient(id), GRACE_MS);
      }
      return;
    }
    leaveRoom(id, false);
  });
});

server.listen(PORT, HOST, () => {
  const ip = lanIP();
  console.log("Risk Seven");
  console.log("  local  http://127.0.0.1:" + PORT + "/");
  console.log("  lan    http://" + ip + ":" + PORT + "/");
  if (publicUrl) console.log("  internet  " + publicUrl);
});
