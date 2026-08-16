#!/usr/bin/env node
"use strict";

const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..", "js");

const cards = require(path.join(root, "cards.js"));
const { Game } = require(path.join(root, "engine.js"));
const AI = require(path.join(root, "ai.js"));

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok  ${name}`);
    })
    .catch((err) => {
      console.error(`  FAIL  ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function n(value, copy) {
  return { id: `n-${value}-${copy == null ? 0 : copy}`, type: "number", value };
}
function plus(v) {
  return { id: `m-plus-${v}`, type: "modifier", kind: "plus", plus: v };
}
function dbl() {
  return { id: "m-double", type: "modifier", kind: "double" };
}
function act(kind, i) {
  return { id: `a-${kind}-${i || 0}`, type: "action", kind };
}
function queue(list) {
  return list.slice().reverse();
}
function padDeck(front, min) {
  const extra = [];
  let copy = 0;
  for (let v = 12; extra.length + front.length < (min || 40); v = v === 1 ? 12 : v - 1) {
    extra.push(n(v, 80 + copy));
    copy += 1;
  }
  return queue(front.concat(extra));
}

function players2() {
  return [
    { id: "you", name: "You", kind: "human" },
    { id: "rex", name: "Rex", kind: "ai", persona: "rex" },
  ];
}

async function runScript(opts) {
  const hits = opts.hits || {};
  const targets = opts.targets || {};
  const game = new Game({
    players: opts.players || players2(),
    goal: opts.goal || 999,
    deck: opts.deck,
    rng: cards.mulberry32(opts.seed || 1),
    animMs: 0,
    sleep: async () => {},
    askHitStay: async (_s, p) => {
      const q = hits[p.id] || [];
      return q.length ? q.shift() : "stay";
    },
    askTarget: async (_s, p, card, cands) => {
      const q = targets[p.id] || [];
      const want = q.length ? q.shift() : null;
      if (want && cands.some((c) => c.id === want)) return want;
      return cands[0].id;
    },
    ackRoundEnd: async () => {
      if (opts.oneRound !== false) game.stop();
    },
  });
  await game.playMatch();
  return game;
}

async function main() {
  console.log("Risk Seven tests");

  await test("deck is 94 cards with official counts", () => {
    const deck = cards.createDeck();
    assert.strictEqual(deck.length, 94);
    const c = cards.deckComposition(deck);
    assert.strictEqual(c.numbers[0], 1);
    assert.strictEqual(c.numbers[1], 1);
    assert.strictEqual(c.numbers[7], 7);
    assert.strictEqual(c.numbers[12], 12);
    assert.strictEqual(c.actions.freeze, 3);
    assert.strictEqual(c.actions.draw3, 3);
    assert.strictEqual(c.actions.secondChance, 3);
    assert.strictEqual(c.modifiers["+2"], 1);
    assert.strictEqual(c.modifiers["+10"], 1);
    assert.strictEqual(c.modifiers.x2, 1);
    const nums = Object.keys(c.numbers).reduce((s, k) => s + c.numbers[k], 0);
    assert.strictEqual(nums, 79);
  });

  await test("score: numbers, then x2, then plus, then +15", () => {
    const p = {
      status: "active",
      numbers: [n(3), n(4), n(12)],
      modifiers: [plus(10), dbl()],
      hasSeven: true,
    };
    assert.strictEqual(cards.scoreRound(p), 19 * 2 + 10 + 15);
    const b = cards.scoreBreakdown(p);
    assert.strictEqual(b.base, 19);
    assert.strictEqual(b.doubled, true);
    assert.strictEqual(b.plus, 10);
    assert.strictEqual(b.bonus, 15);
    assert.strictEqual(b.total, 63);
  });

  await test("bust scores zero even with modifiers", () => {
    const p = {
      status: "busted",
      numbers: [n(5), n(5, 1)],
      modifiers: [plus(10), dbl()],
      hasSeven: false,
    };
    assert.strictEqual(cards.scoreRound(p), 0);
  });

  await test("duplicate number busts", async () => {
    const game = await runScript({
      deck: padDeck([n(8), n(4, 0), n(4, 1)]),
      hits: { you: ["hit"], rex: ["stay"] },
    });
    const you = game.players[0];
    const rex = game.players[1];
    assert.strictEqual(you.status, "busted");
    assert.strictEqual(you.totalScore, 0);
    assert.strictEqual(rex.totalScore, 8);
  });

  await test("second chance saves a duplicate", async () => {
    const game = await runScript({
      deck: padDeck([act("secondChance"), n(3), n(6), n(6, 1)]),
      hits: { you: ["stay"], rex: ["hit", "hit", "stay"] },
    });
    const rex = game.players[1];
    assert.notStrictEqual(rex.status, "busted");
    assert.ok(rex.numbers.some((c) => c.value === 6));
    assert.strictEqual(rex.numbers.filter((c) => c.value === 6).length, 1);
    assert.strictEqual(rex.secondChance, false);
    assert.strictEqual(rex.totalScore, 6);
  });

  await test("seven unique numbers ends the round and pays 15", async () => {
    const game = await runScript({
      deck: padDeck([n(12), n(1), n(2), n(3), n(4), n(5), n(6), n(7)]),
      hits: { you: ["hit", "hit", "hit", "hit", "hit", "hit"], rex: ["stay"] },
    });
    const you = game.players[0];
    assert.strictEqual(you.hasSeven, true);
    assert.strictEqual(you.numbers.length, 7);
    assert.strictEqual(you.totalScore, 1 + 2 + 3 + 4 + 5 + 6 + 7 + 15);
    assert.strictEqual(game.round, 1);
  });

  await test("human lock with no one else left banks without asking", async () => {
    let asked = 0;
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(9), n(10), act("freeze")]),
      rng: cards.mulberry32(1),
      animMs: 0,
      sleep: async () => {},
      askHitStay: async (_s, p) => (p.id === "rex" ? "stay" : "hit"),
      askTarget: async () => {
        asked += 1;
        return "you";
      },
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    const you = game.players.find((p) => p.id === "you");
    assert.strictEqual(asked, 0);
    assert.strictEqual(you.status, "frozen");
    assert.strictEqual(you.totalScore, 10);
  });

  await test("freeze banks the target", async () => {
    const game = await runScript({
      deck: padDeck([n(9), n(10), act("freeze")]),
      hits: { you: [], rex: ["hit"] },
      targets: { rex: ["you"] },
    });
    const you = game.players[0];
    assert.strictEqual(you.status, "frozen");
    assert.strictEqual(you.totalScore, 10);
  });

  await test("freeze cannot land on someone already frozen", async () => {
    const game = await runScript({
      deck: padDeck([n(9), n(10), act("freeze"), act("freeze")]),
      hits: { you: [], rex: ["hit", "hit"] },
      targets: { rex: ["you", "you"] },
    });
    const you = game.players[0];
    const rex = game.players[1];
    assert.strictEqual(you.status, "frozen");
    assert.strictEqual(you.totalScore, 10);
    assert.strictEqual(rex.status, "frozen");
  });

  await test("initial Draw Three waits for a human assignment", async () => {
    let asked = 0;
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(8), act("draw3"), n(1), n(2), n(3)]),
      rng: cards.mulberry32(3),
      animMs: 0,
      sleep: async () => {},
      askHitStay: async () => "stay",
      askTarget: async (_s, p, card) => {
        if (card.kind === "draw3" && p.id === "you") {
          asked += 1;
          return "rex";
        }
        return p.id;
      },
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(asked >= 1, "human must assign Draw Three");
    const rex = game.players[1];
    assert.ok(rex.numbers.length >= 3);
  });

  await test("draw three can be played on yourself", async () => {
    const asked = [];
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(2), act("draw3"), n(3), n(4), n(5)]),
      rng: cards.mulberry32(2),
      animMs: 0,
      sleep: async () => {},
      askHitStay: async () => "stay",
      askTarget: async (_s, p, card, cands) => {
        asked.push({ from: p.id, kind: card.kind, ids: cands.map((c) => c.id) });
        return p.id;
      },
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(asked.some((a) => a.kind === "draw3"));
    const you = game.players[0];
    assert.ok(you.numbers.length >= 3);
    assert.notStrictEqual(you.status, "busted");
  });

  await test("given Triple leaves the giver at once", async () => {
    let assigned = false;
    let giverStillHeld = false;
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(9), act("draw3"), n(1), n(2), n(3)]),
      rng: cards.mulberry32(4),
      animMs: 0,
      sleep: async () => {},
      onUpdate: (snap) => {
        const you = snap.players.find((p) => p.id === "you");
        const rex = snap.players.find((p) => p.id === "rex");
        if (rex.received && rex.received.some((c) => c.kind === "draw3")) {
          assigned = true;
          if (you.staging && you.staging.kind === "draw3") giverStillHeld = true;
        }
      },
      askHitStay: async (_s, p) => (p.id === "you" ? "stay" : "hit"),
      askTarget: async (_s, p, card) => (card.kind === "draw3" && p.id === "you" ? "rex" : p.id),
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(assigned, "Triple should land on Rex");
    assert.strictEqual(giverStillHeld, false);
  });

  await test("draw three can be given to another player", async () => {
    const game = await runScript({
      deck: padDeck([n(9), act("draw3"), n(1), n(2), n(3)]),
      hits: { you: ["stay"], rex: [] },
      targets: { you: ["rex"] },
    });
    const rex = game.players[1];
    assert.ok(rex.numbers.length >= 3);
  });

  await test("draw three stops on bust and drops pending freeze", async () => {
    const game = await runScript({
      deck: padDeck([act("draw3"), n(8), n(8, 1), act("freeze"), n(1)]),
      hits: { you: [], rex: ["stay"] },
      targets: { rex: ["you"] },
    });
    const you = game.players[0];
    assert.strictEqual(you.status, "busted");
    assert.strictEqual(you.totalScore, 0);
    assert.ok(game.players.every((p) => p.status !== "frozen"));
  });

  await test("0 counts toward seven and scores nothing extra", () => {
    const p = {
      status: "active",
      numbers: [n(0), n(1), n(2), n(3), n(4), n(5), n(6)],
      modifiers: [],
      hasSeven: true,
    };
    assert.strictEqual(cards.scoreRound(p), 21 + 15);
  });

  await test("extra second chance cannot be kept and must go to another player", async () => {
    const game = await runScript({
      deck: padDeck([act("secondChance"), n(4), act("secondChance"), n(5)]),
      hits: { you: ["stay"], rex: ["hit", "stay"] },
      targets: { rex: ["you"] },
    });
    const rex = game.players.find((p) => p.id === "rex");
    const you = game.players.find((p) => p.id === "you");
    assert.strictEqual(rex.secondChance, true);
    assert.strictEqual(you.secondChance, true);
  });

  await test("personas hit and target differently", () => {
    const held = [n(12), n(10), n(8)];
    const rem = [];
    for (let i = 0; i < 18; i++) rem.push(n(12, 20 + i));
    for (let i = 0; i < 4; i++) rem.push(n(3, 40 + i));
    function face(id, extra) {
      return Object.assign({
        id,
        name: id,
        kind: "ai",
        persona: id,
        status: "active",
        numbers: held.slice(),
        modifiers: [],
        secondChance: false,
        hasSeven: false,
        totalScore: 30,
        roundScore: 30,
      }, extra || {});
    }
    const you = face("you", { kind: "human", persona: null, numbers: [n(4)], roundScore: 4, totalScore: 120 });
    const rex = face("rex");
    const noa = face("noa");
    const kit = face("kit");
    const hot = face("max", { numbers: [n(1), n(2), n(3), n(4), n(5)], roundScore: 15, totalScore: 40 });
    const rexSnap = { goal: 200, difficulty: "sharp", remaining: rem, players: [rex, you] };
    const noaSnap = { goal: 200, difficulty: "sharp", remaining: rem, players: [noa, you] };
    assert.strictEqual(AI.decideHitStay(rexSnap, rex, { rng: () => 0.5, difficulty: "sharp" }), "hit");
    assert.strictEqual(AI.decideHitStay(noaSnap, noa, { rng: () => 0.5, difficulty: "sharp" }), "stay");
    const kitSnap = { goal: 200, difficulty: "sharp", remaining: rem, players: [kit, hot, you] };
    const kitLock = AI.decideTarget(kitSnap, kit, act("freeze"), [kit, hot, you], {
      rng: () => 0.1,
      difficulty: "sharp",
    });
    assert.strictEqual(kitLock, "max");
    const bea = face("bea", { totalScore: 90 });
    const behind = face("cal", { totalScore: 10, numbers: [n(6)], roundScore: 6 });
    const beaSnap = { goal: 200, difficulty: "sharp", remaining: rem, players: [bea, behind, you] };
    const spareTo = AI.decideTarget(beaSnap, bea, act("secondChance"), [behind, you], {
      rng: () => 0.1,
      difficulty: "sharp",
    });
    assert.strictEqual(spareTo, "cal");
  });

  await test("AI only returns legal hit/stay and targets", () => {
    const rem = cards.createDeck().filter((c) => c.type === "number").slice(0, 30);
    const player = {
      id: "rex",
      name: "Rex",
      kind: "ai",
      persona: "rex",
      status: "active",
      numbers: [n(12), n(5)],
      modifiers: [],
      secondChance: false,
      hasSeven: false,
      totalScore: 40,
      roundScore: 17,
    };
    const ivy = {
      ...player,
      id: "ivy",
      name: "Ivy",
      persona: "ivy",
      numbers: [n(11)],
      roundScore: 11,
      totalScore: 80,
    };
    const snap = {
      goal: 200,
      difficulty: "sharp",
      remaining: rem,
      players: [player, ivy],
    };
    for (let i = 0; i < 40; i++) {
      const hs = AI.decideHitStay(snap, player, { rng: cards.mulberry32(i), difficulty: "sharp" });
      assert.ok(hs === "hit" || hs === "stay");
      const t = AI.decideTarget(snap, player, act("freeze"), [player, ivy], {
        rng: cards.mulberry32(i + 9),
        difficulty: "sharp",
      });
      assert.ok(t === "rex" || t === "ivy");
    }
  });

  await test("50 AI vs AI matches finish with a single winner at or above goal", async () => {
    const wins = { rex: 0, ivy: 0, max: 0 };
    for (let seed = 1; seed <= 50; seed++) {
      const rng = cards.mulberry32(seed * 997);
      const game = new Game({
        players: [
          { id: "rex", name: "Rex", kind: "ai", persona: "rex" },
          { id: "ivy", name: "Ivy", kind: "ai", persona: "ivy" },
          { id: "max", name: "Max", kind: "ai", persona: "max" },
        ],
        goal: 200,
        difficulty: "sharp",
        rng,
        animMs: 0,
        sleep: async () => {},
        askHitStay: async (snap, p) => AI.decideHitStay(snap, p, { rng, difficulty: "sharp" }),
        askTarget: async (snap, p, card, cands) =>
          AI.decideTarget(snap, p, card, cands, { rng, difficulty: "sharp" }),
        ackRoundEnd: async () => {},
      });
      await game.playMatch();
      assert.strictEqual(game.winners.length, 1, `seed ${seed} winners ${game.winners.length}`);
      const w = game.winners[0];
      assert.ok(w.totalScore >= 200, `seed ${seed} score ${w.totalScore}`);
      const top = Math.max(...game.players.map((p) => p.totalScore));
      assert.strictEqual(w.totalScore, top);
      wins[w.id] += 1;
      const total = game.deck.length + game.discard.length;
      assert.strictEqual(total, 94, `card count ${total} seed ${seed}`);
    }
    console.log(`       winners  Rex ${wins.rex}  Ivy ${wins.ivy}  Max ${wins.max}`);
  });

  const table = require(path.join(__dirname, "..", "server", "table.js"));
  const looks = require(path.join(__dirname, "..", "js", "looks.js"));

  await test("player looks include 4 women, 4 men, 4 wild", () => {
    const groups = { women: 0, men: 0, wild: 0 };
    looks.LOOKS.forEach((l) => {
      groups[l.group] += 1;
    });
    assert.strictEqual(looks.LOOKS.length, 12);
    assert.strictEqual(groups.women, 4);
    assert.strictEqual(groups.men, 4);
    assert.strictEqual(groups.wild, 4);
    assert.strictEqual(looks.normalize("male"), "m1");
    assert.strictEqual(looks.normalize("female"), "f1");
    assert.ok(looks.src("n2").indexOf("look-n2") >= 0);
  });

  await test("match log names the player, never a generic you-verb", async () => {
    const game = await runScript({
      players: [
        { id: "you", name: "Bram", kind: "human" },
        { id: "rex", name: "Rex", kind: "ai", persona: "rex" },
      ],
      deck: padDeck([n(8), n(4)]),
      hits: { you: ["stay"], rex: ["stay"] },
    });
    const lines = game.log.map((l) => l.text).join(" | ");
    assert.ok(lines.indexOf("Bram stays") >= 0, lines);
    assert.ok(lines.indexOf("Rex stays") >= 0, lines);
    assert.ok(lines.indexOf("You stay") < 0, lines);
  });

  await test("empty seats fill with AI up to four", () => {
    const room = table.makeRoom({
      code: "TEST1",
      tableSize: 4,
      host: {
        id: "h1",
        name: "Bram",
        avatar: "male",
        portrait: "assets/you-male.jpg",
      },
      rng: cards.mulberry32(7),
    });
    assert.strictEqual(room.seats.length, 4);
    assert.strictEqual(table.humansOf(room).length, 1);
    assert.strictEqual(room.seats.filter((s) => s.kind === "ai").length, 3);
    const names = new Set(room.seats.map((s) => s.id));
    assert.strictEqual(names.size, 4);
  });

  await test("joining humans replace AI seats", () => {
    const room = table.makeRoom({
      code: "TEST2",
      host: { id: "h1", name: "A", avatar: "female", portrait: "x" },
      rng: cards.mulberry32(3),
    });
    const role = table.seatHuman(room, { id: "h2", name: "B", avatar: "male", portrait: "y" });
    assert.strictEqual(role, "player");
    assert.strictEqual(table.humansOf(room).length, 2);
    assert.strictEqual(room.seats.filter((s) => s.kind === "ai").length, 2);
    table.seatHuman(room, { id: "h3", name: "C", avatar: "female", portrait: "z" });
    table.seatHuman(room, { id: "h4", name: "D", avatar: "male", portrait: "w" });
    const watch = table.seatHuman(room, { id: "h5", name: "E", avatar: "female", portrait: "q" });
    assert.strictEqual(watch, "spectate");
    assert.strictEqual(table.humansOf(room).length, 4);
    assert.strictEqual(room.watchers.length, 1);
  });

  await test("leaving a lobby seat puts AI back", () => {
    const room = table.makeRoom({
      code: "TEST3",
      host: { id: "h1", name: "A", avatar: "female", portrait: "x" },
      rng: cards.mulberry32(1),
    });
    table.seatHuman(room, { id: "h2", name: "B", avatar: "male", portrait: "y" });
    table.leaveSeat(room, "h2");
    assert.strictEqual(table.humansOf(room).length, 1);
    assert.strictEqual(room.seats.length, 4);
    assert.strictEqual(room.seats.filter((s) => s.kind === "ai").length, 3);
  });

  await test("disconnected human becomes a stand-in AI and can sit back down", () => {
    const room = table.makeRoom({
      code: "TEST4",
      host: { id: "h1", name: "A", avatar: "female", portrait: "assets/you-female.jpg" },
      rng: cards.mulberry32(2),
    });
    table.seatHuman(room, { id: "h2", name: "B", avatar: "male", portrait: "assets/you-male.jpg" });
    room.game = {
      players: table.matchPlayers(room).map((p) => Object.assign({}, p)),
    };
    const persona = table.takeoverAi(room, "h2");
    assert.ok(persona);
    const seat = room.seats.find((s) => s.id === "h2");
    assert.strictEqual(seat.kind, "ai");
    assert.strictEqual(seat.name, "B");
    const gp = room.game.players.find((p) => p.id === "h2");
    assert.strictEqual(gp.kind, "ai");
    table.restoreHuman(room, "h2", { id: "h2", name: "Bram", avatar: "male", portrait: "assets/you-male.jpg" });
    assert.strictEqual(seat.kind, "human");
    assert.strictEqual(seat.name, "Bram");
    assert.strictEqual(gp.kind, "human");
  });

  await test("AI with Spare always hits", () => {
    const noa = {
      id: "noa",
      name: "Noa",
      kind: "ai",
      persona: "noa",
      status: "active",
      numbers: [n(12), n(10), n(8)],
      modifiers: [],
      secondChance: true,
      hasSeven: false,
      totalScore: 90,
      roundScore: 30,
    };
    const ivy = Object.assign({}, noa, { id: "ivy", name: "Ivy", persona: "ivy", secondChance: false, numbers: [n(4)], roundScore: 4 });
    const rem = [];
    for (let i = 0; i < 18; i++) rem.push(n(12, 30 + i));
    ["easy", "normal", "sharp"].forEach((diff) => {
      for (let i = 0; i < 20; i++) {
        const hs = AI.decideHitStay(
          { goal: 200, difficulty: diff, remaining: rem, players: [noa, ivy] },
          noa,
          { rng: cards.mulberry32(i + 3), difficulty: diff }
        );
        assert.strictEqual(hs, "hit", "spare stay on " + diff + " seed " + i);
      }
    });
  });

  await test("easy AI banks more often than sharp AI", () => {
    const rex = {
      id: "rex",
      name: "Rex",
      kind: "ai",
      persona: "rex",
      status: "active",
      numbers: [n(12), n(8), n(5)],
      modifiers: [],
      secondChance: false,
      hasSeven: false,
      totalScore: 40,
      roundScore: 25,
    };
    const ivy = {
      ...rex,
      id: "ivy",
      name: "Ivy",
      persona: "ivy",
      numbers: [n(4)],
      roundScore: 4,
      totalScore: 80,
    };
    const rem = [];
    for (let i = 0; i < 20; i++) rem.push(n(12, 30 + i));
    let easyStay = 0;
    let sharpStay = 0;
    for (let i = 0; i < 60; i++) {
      const rng = cards.mulberry32(i * 17 + 3);
      const snap = { goal: 200, remaining: rem, players: [rex, ivy] };
      if (AI.decideHitStay(Object.assign({ difficulty: "easy" }, snap), rex, { rng, difficulty: "easy" }) === "stay") {
        easyStay += 1;
      }
      if (AI.decideHitStay(Object.assign({ difficulty: "sharp" }, snap), rex, { rng, difficulty: "sharp" }) === "stay") {
        sharpStay += 1;
      }
    }
    assert.strictEqual(sharpStay, 0);
    assert.ok(easyStay > 10, `easy stays ${easyStay}`);
  });

  await test("two tables stay isolated", () => {
    const a = table.makeRoom({
      code: "AAAAA",
      host: { id: "h1", name: "Ann", avatar: "f1", portrait: "x" },
      rng: cards.mulberry32(1),
    });
    const b = table.makeRoom({
      code: "BBBBB",
      host: { id: "h2", name: "Ben", avatar: "m1", portrait: "y" },
      rng: cards.mulberry32(2),
    });
    table.seatHuman(a, { id: "h3", name: "Cara", avatar: "f2", portrait: "z" });
    assert.strictEqual(table.humansOf(a).length, 2);
    assert.strictEqual(table.humansOf(b).length, 1);
    assert.strictEqual(a.seats.some((s) => s.name === "Ben"), false);
    assert.strictEqual(b.seats.some((s) => s.name === "Cara"), false);
    const va = table.roomView(a);
    const vb = table.roomView(b);
    assert.strictEqual(va.code, "AAAAA");
    assert.strictEqual(vb.code, "BBBBB");
    assert.notStrictEqual(va.hostId, vb.hostId);
  });

  await test("room view is just a code table", () => {
    const room = table.makeRoom({
      code: "AB3DK",
      host: { id: "h1", name: "A", avatar: "female", portrait: "x" },
      rng: cards.mulberry32(4),
    });
    const view = table.roomView(room);
    assert.strictEqual(view.code, "AB3DK");
    assert.strictEqual(view.visibility, undefined);
    assert.strictEqual(view.inviteUrl, undefined);
    assert.strictEqual(view.seats.length, 4);
  });

  await test("opening Triple waits for the human to pick a target", async () => {
    let asked = 0;
    const game = new Game({
      players: [
        { id: "rex", name: "Rex", kind: "ai", persona: "rex" },
        { id: "you", name: "You", kind: "human" },
      ],
      goal: 999,
      deck: padDeck([act("draw3"), n(1), n(2), n(3), n(4)]),
      rng: cards.mulberry32(3),
      animMs: 0,
      sleep: async () => {},
      askHitStay: async () => "stay",
      askTarget: async (_s, p, card) => {
        if (card.kind === "draw3" && p.id === "you") {
          asked += 1;
          return "rex";
        }
        return p.id;
      },
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(asked >= 1, "opening Triple must wait for a human target");
  });

  await test("human Triple still asks when only the drawer is left", async () => {
    let asked = 0;
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(9), n(10), act("draw3"), n(1), n(2), n(3)]),
      rng: cards.mulberry32(3),
      animMs: 0,
      sleep: async () => {},
      askHitStay: async (_s, p) => (p.id === "rex" ? "stay" : "hit"),
      askTarget: async (_s, p, card) => {
        if (card.kind === "draw3") asked += 1;
        return p.id;
      },
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(asked >= 1, "human must still assign Triple to themselves");
  });

  await test("unused Spare at round end does not log a save", async () => {
    const kinds = [];
    let spareAtEnd = false;
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([act("secondChance"), n(4)]),
      rng: cards.mulberry32(3),
      animMs: 0,
      sleep: async () => {},
      onUpdate: (snap) => {
        snap.log.forEach((l) => kinds.push(l.kind));
        if (snap.phase === "roundEnd") {
          spareAtEnd = snap.players.some((p) => p.secondChance);
        }
      },
      askHitStay: async () => "stay",
      askTarget: async (_s, p, _c, cands) => cands[0].id,
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(spareAtEnd, "Spare should still be held when the round is scored");
    assert.ok(!kinds.includes("save"), "round end must not play a Spare save");
  });

  await test("round banner finishes before the first card is revealed", async () => {
    let beforeReveal = 0;
    let revealed = false;
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(2), n(3)]),
      rng: cards.mulberry32(3),
      animMs: 1200,
      sleep: async (ms) => {
        if (!revealed) beforeReveal += ms;
      },
      onUpdate: (snap) => {
        if (snap.phase === "reveal") revealed = true;
      },
      askHitStay: async () => "stay",
      askTarget: async (_s, p, _c, cands) => cands[0].id,
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    assert.ok(beforeReveal >= 1650, "dealing should wait for the round banner");
  });

  await test("a round emits the dealing phase only once", async () => {
    const phases = [];
    const game = new Game({
      players: players2(),
      goal: 999,
      deck: padDeck([n(2), n(3), n(4), n(5)]),
      rng: cards.mulberry32(8),
      animMs: 0,
      sleep: async () => {},
      onUpdate: (snap) => {
        if (snap.phase === "dealing") phases.push(snap.round);
      },
      askHitStay: async () => "stay",
      askTarget: async (_s, p, _c, cands) => cands[0].id,
      ackRoundEnd: async () => game.stop(),
    });
    await game.playMatch();
    const dealing = phases.filter((r) => r === 1);
    assert.strictEqual(dealing.length, 1);
  });

  if (process.exitCode) {
    console.log("\nSome tests failed.");
  } else {
    console.log(`\n${passed} tests passed.`);
  }
}

main();
