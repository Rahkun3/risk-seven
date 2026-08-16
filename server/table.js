"use strict";

const { PERSONAS } = require("../js/engine.js");

const MAX = 4;
const PERSONA_IDS = Object.keys(PERSONAS);

function shuffle(list, rng) {
  const a = list.slice();
  const rand = rng || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPersonas(need, used, rng) {
  const taken = used instanceof Set ? used : new Set(used || []);
  const pool = shuffle(
    PERSONA_IDS.filter((id) => !taken.has(id)),
    rng
  );
  return pool.slice(0, Math.max(0, need));
}

function aiSeat(id) {
  const p = PERSONAS[id];
  return {
    id,
    name: p.name,
    avatar: null,
    kind: "ai",
    title: p.title,
    portrait: p.portrait,
    persona: id,
    away: false,
  };
}

function humanSeat(person) {
  return {
    id: person.id,
    name: person.name,
    avatar: person.avatar,
    kind: "human",
    title: person.title || "",
    portrait: person.portrait,
    persona: null,
    away: false,
  };
}

function humansOf(room) {
  return room.seats.filter((s) => s.kind === "human");
}

function fillAi(room, rng) {
  const humans = humansOf(room);
  let ais = room.seats.filter((s) => s.kind === "ai");
  const need = Math.max(0, room.tableSize - humans.length);
  const used = new Set(ais.map((a) => a.persona || a.id));
  while (ais.length < need) {
    const next = pickPersonas(1, used, rng)[0];
    if (!next) break;
    used.add(next);
    ais.push(aiSeat(next));
  }
  if (ais.length > need) ais = ais.slice(0, need);
  room.seats = humans.concat(ais);
  return room;
}

function makeRoom(opts) {
  const tableSize = Math.max(2, Math.min(MAX, Number(opts.tableSize) || MAX));
  const room = {
    code: opts.code,
    hostId: opts.host.id,
    tableSize,
    difficulty: opts.difficulty === "easy" || opts.difficulty === "sharp" ? opts.difficulty : "normal",
    playing: false,
    game: null,
    pending: null,
    seats: [humanSeat(opts.host)],
    watchers: [],
  };
  return fillAi(room, opts.rng);
}

function seatHuman(room, person) {
  const already = room.seats.find((s) => s.id === person.id);
  if (already) {
    already.away = false;
    already.name = person.name;
    already.avatar = person.avatar;
    already.portrait = person.portrait;
    return "player";
  }
  const watching = room.watchers.find((w) => w.id === person.id);
  if (watching) return "spectate";

  if (room.playing || humansOf(room).length >= room.tableSize) {
    room.watchers.push({ id: person.id, name: person.name, avatar: person.avatar, portrait: person.portrait });
    return "spectate";
  }

  room.seats = humansOf(room).concat([humanSeat(person)], room.seats.filter((s) => s.kind === "ai"));
  fillAi(room);
  return "player";
}

function dropWatcher(room, id) {
  room.watchers = room.watchers.filter((w) => w.id !== id);
}

function leaveSeat(room, id) {
  const wasHost = room.hostId === id;
  room.seats = room.seats.filter((s) => s.id !== id);
  dropWatcher(room, id);
  if (wasHost) {
    const next = humansOf(room)[0];
    room.hostId = next ? next.id : null;
  }
  if (!room.playing) fillAi(room);
  return room;
}

function promoteWatchers(room) {
  while (room.watchers.length && humansOf(room).length < room.tableSize) {
    const next = room.watchers.shift();
    seatHuman(room, {
      id: next.id,
      name: next.name,
      avatar: next.avatar,
      portrait: next.portrait,
      title: "",
    });
  }
  return room;
}

function takeoverAi(room, id) {
  const seat = room.seats.find((s) => s.id === id && s.kind === "human");
  if (!seat) return null;
  const used = new Set(room.seats.filter((s) => s.kind === "ai").map((s) => s.persona || s.id));
  const persona = pickPersonas(1, used)[0] || "bea";
  seat.kind = "ai";
  seat.persona = persona;
  seat.title = "AI now";
  seat.away = false;
  if (room.game && Array.isArray(room.game.players)) {
    const gp = room.game.players.find((p) => p.id === id);
    if (gp) {
      gp.kind = "ai";
      gp.persona = persona;
    }
  }
  if (room.hostId === id) {
    const next = humansOf(room)[0];
    room.hostId = next ? next.id : null;
  }
  return persona;
}

function restoreHuman(room, id, person) {
  const seat = room.seats.find((s) => s.id === id);
  if (!seat) return false;
  seat.kind = "human";
  seat.name = person.name;
  seat.avatar = person.avatar;
  seat.portrait = person.portrait;
  seat.title = "";
  seat.persona = null;
  seat.away = false;
  if (room.game && Array.isArray(room.game.players)) {
    const gp = room.game.players.find((p) => p.id === id);
    if (gp) {
      gp.kind = "human";
      gp.name = person.name;
      gp.portrait = person.portrait;
      gp.persona = null;
    }
  }
  return true;
}

function matchPlayers(room) {
  return room.seats.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    persona: s.kind === "ai" ? s.persona || s.id : null,
    portrait: s.portrait,
    title: s.kind === "ai" ? s.title : "",
  }));
}

function seatView(seat) {
  return {
    id: seat.id,
    name: seat.name,
    avatar: seat.avatar,
    kind: seat.kind,
    title: seat.title || "",
    portrait: seat.portrait,
    away: !!seat.away,
  };
}

function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    tableSize: room.tableSize,
    difficulty: room.difficulty,
    playing: room.playing,
    seats: room.seats.map(seatView),
    watchers: room.watchers.map((w) => ({ id: w.id, name: w.name })),
  };
}

function hasLiveHumans(room) {
  return humansOf(room).some((s) => !s.away) || room.watchers.length > 0;
}

module.exports = {
  MAX,
  PERSONAS,
  PERSONA_IDS,
  shuffle,
  pickPersonas,
  aiSeat,
  humanSeat,
  humansOf,
  fillAi,
  makeRoom,
  seatHuman,
  leaveSeat,
  promoteWatchers,
  takeoverAi,
  restoreHuman,
  matchPlayers,
  roomView,
  hasLiveHumans,
};
