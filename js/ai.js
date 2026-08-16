/* Card-counting Risk Seven opponents. Legal moves only. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});

  const LINES = {
    rex: {
      hit: ["Let's cook.", "Still hitting.", "Seven or bust.", "One more."],
      stay: ["Fine. Banking.", "That's a stack.", "I'll take it."],
      freeze: ["Sit down.", "That's enough of that.", "Frozen."],
      draw3: ["Eat three.", "Don't blink.", "Three more."],
      sc: ["Don't waste it.", "Here. Try not to die."],
    },
    ivy: {
      hit: ["The count is fine.", "Still +EV.", "One more look."],
      stay: ["Banking.", "That's the number.", "No need to be greedy."],
      freeze: ["You're done.", "Lock it.", "That's the threat."],
      draw3: ["Let's see those three.", "Pressure.", "Take them."],
      sc: ["You need this more.", "Insurance. Don't spend it early."],
    },
    max: {
      hit: ["Why not.", "Chaos wants another.", "I'm in."],
      stay: ["Okay okay, staying.", "Boring, but fine.", "Bank. For now."],
      freeze: ["Ice tray.", "Stop wriggling.", "Night night."],
      draw3: ["Three's my favorite.", "Gift or grenade?", "Open them."],
      sc: ["Catch.", "Don't make it weird.", "A little luck. Spend it."],
    },
    cal: {
      hit: ["Still working.", "One more look.", "Not done."],
      stay: ["That's a living.", "Good enough.", "I'll take the grind."],
      freeze: ["Clock's out.", "Sit.", "That's the pot."],
      draw3: ["Let's see the work.", "Three more. Earn it."],
      sc: ["Insurance.", "Don't waste a life."],
    },
    noa: {
      hit: ["Barely.", "The count allows it.", "Fine. One."],
      stay: ["That's the line.", "Banking. Obviously.", "No."],
      freeze: ["Stop.", "You're finished.", "Lock."],
      draw3: ["Pressure.", "Take the risk I won't."],
      sc: ["Here. Be careful."],
    },
    kit: {
      hit: ["Keep walking.", "I'm still in.", "Go on."],
      stay: ["I'll watch from here.", "Banked. Your move."],
      freeze: ["That's enough heat.", "Night.", "Cute run."],
      draw3: ["Open them.", "Don't blink."],
      sc: ["A favor. Don't thank me."],
    },
    sol: {
      hit: ["The deck likes me.", "Again.", "We're flying."],
      stay: ["Even I know when to cash.", "Bank the gold."],
      freeze: ["Sit down, darling.", "Mine now."],
      draw3: ["Three gifts.", "Let's get loud."],
      sc: ["A little sparkle. Spend it."],
    },
    bea: {
      hit: ["Alright, one more.", "Still comfortable.", "Why not."],
      stay: ["That's a nice pile.", "I'll stop there."],
      freeze: ["Sorry, love.", "That's the one."],
      draw3: ["Three for you.", "Let's see."],
      sc: ["Share the luck."],
    },
  };

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }

  function remaining(state) {
    if ((state.difficulty || "") === "easy") return [];
    return state.remaining && state.remaining.length ? state.remaining : [];
  }

  function bustProb(state, player) {
    const rem = remaining(state);
    if (!rem.length) return 0;
    const held = new Set(player.numbers.map((c) => c.value));
    let busts = 0;
    for (const c of rem) {
      if (c.type === "number" && held.has(c.value)) busts += 1;
    }
    return busts / rem.length;
  }

  function uniqueHitProb(state, player) {
    const rem = remaining(state);
    if (!rem.length) return 0;
    const held = new Set(player.numbers.map((c) => c.value));
    let hits = 0;
    for (const c of rem) {
      if (c.type === "number" && !held.has(c.value)) hits += 1;
    }
    return hits / rem.length;
  }

  function outcomeScore(player, card) {
    const score = RiskSeven.cards.scoreRound;
    if (card.type === "number") {
      const dup = player.numbers.some((c) => c.value === card.value);
      if (dup) return player.secondChance ? score(player) : 0;
      const next = {
        ...player,
        numbers: player.numbers.concat(card),
        hasSeven: player.numbers.length + 1 >= 7,
        status: "active",
      };
      return score(next);
    }
    if (card.type === "modifier") {
      return score({ ...player, modifiers: player.modifiers.concat(card), status: "active" });
    }
    if (card.kind === "secondChance") {
      return score(player) + (player.secondChance ? 1 : 5);
    }
    return score(player) + 0.5;
  }

  function hitEV(state, player) {
    const rem = remaining(state);
    const stay = RiskSeven.cards.scoreRound(player);
    if (!rem.length) return stay;
    let total = 0;
    for (const card of rem) total += outcomeScore(player, card);
    return total / rem.length;
  }

  function leaderGap(state, player) {
    const others = state.players.filter((p) => p.id !== player.id);
    const lead = others.length ? Math.max(...others.map((p) => p.totalScore)) : 0;
    return player.totalScore - lead;
  }

  const TRAITS = {
    rex: {
      hit: 14,
      risk: 0.14,
      huntSeven: true,
      bankFloor: 48,
      spareHit: 1,
      drawSelf: 0.55,
      giveTriple: 0.22,
      freezeStyle: "hot",
      freezeSelf: -0.6,
      spareStyle: "weak",
      chaos: 0.02,
      think: 0,
    },
    ivy: {
      hit: -10,
      risk: -0.08,
      huntSeven: false,
      bankFloor: 16,
      spareHit: 0.5,
      drawSelf: -0.45,
      giveTriple: 0.78,
      freezeStyle: "threat",
      freezeSelf: 0.18,
      spareStyle: "math",
      chaos: 0,
      think: 240,
    },
    max: {
      hit: 4,
      risk: 0.04,
      huntSeven: false,
      bankFloor: 20,
      spareHit: 0.88,
      drawSelf: 0.38,
      giveTriple: 0.62,
      freezeStyle: "random",
      freezeSelf: 0.06,
      spareStyle: "random",
      chaos: 0.3,
      think: -80,
    },
    cal: {
      hit: 3,
      risk: -0.01,
      huntSeven: false,
      bankFloor: 22,
      spareHit: 0.7,
      drawSelf: 0.16,
      giveTriple: 0.4,
      freezeStyle: "lead",
      freezeSelf: 0.06,
      spareStyle: "behind",
      chaos: 0,
      think: 140,
    },
    noa: {
      hit: -14,
      risk: -0.12,
      huntSeven: false,
      bankFloor: 12,
      spareHit: 0.22,
      drawSelf: -0.55,
      giveTriple: 0.88,
      freezeStyle: "score",
      freezeSelf: 0.42,
      spareStyle: "weak",
      chaos: 0,
      think: 240,
    },
    kit: {
      hit: 0,
      risk: 0,
      huntSeven: false,
      bankFloor: 18,
      spareHit: 0.64,
      drawSelf: -0.18,
      giveTriple: 0.72,
      freezeStyle: "closer",
      freezeSelf: -0.25,
      spareStyle: "weak",
      chaos: 0.04,
      think: 40,
    },
    sol: {
      hit: 12,
      risk: 0.12,
      huntSeven: false,
      bankFloor: 32,
      spareHit: 0.95,
      drawSelf: 0.52,
      giveTriple: 0.28,
      freezeStyle: "hot",
      freezeSelf: -0.35,
      spareStyle: "self",
      chaos: 0.1,
      think: -80,
    },
    bea: {
      hit: 0,
      risk: 0,
      huntSeven: false,
      bankFloor: 18,
      spareHit: 0.7,
      drawSelf: 0.1,
      giveTriple: 0.5,
      freezeStyle: "lead",
      freezeSelf: 0.1,
      spareStyle: "behind",
      chaos: 0.03,
      think: 40,
    },
  };

  function traits(persona) {
    return TRAITS[persona] || {
      hit: 0,
      risk: 0,
      huntSeven: false,
      bankFloor: 18,
      spareHit: 0.7,
      drawSelf: 0,
      giveTriple: 0.5,
      freezeStyle: "threat",
      freezeSelf: 0,
      spareStyle: "math",
      chaos: 0,
      think: 0,
    };
  }

  function decideHitStay(state, player, opts) {
    const rng = (opts && opts.rng) || Math.random;
    const diff = (opts && opts.difficulty) || state.difficulty || "normal";
    const stay = RiskSeven.cards.scoreRound(player);
    const bust = player.secondChance ? 0 : bustProb(state, player);
    const ev = hitEV(state, player);
    const t = traits(player.persona);
    const gap = leaderGap(state, player);
    const need = state.goal - player.totalScore;
    const active = state.players.filter((p) => p.status === "active");

    if (player.secondChance && player.numbers.length < 7) return "hit";

    if (diff === "easy") {
      if (t.huntSeven && player.numbers.length < 7 && rng() < 0.4) return "hit";
      if (stay >= 12 && rng() < 0.58) return "stay";
      if (player.numbers.length >= 5 && rng() < 0.55) return "stay";
      return rng() < 0.6 ? "hit" : "stay";
    }

    if (t.huntSeven && player.numbers.length < 7) return "hit";

    if (t.chaos && rng() < t.chaos && diff !== "sharp") {
      if (stay >= t.bankFloor + 12 && bust > 0.28) return "stay";
      return rng() < 0.58 + t.risk ? "hit" : "stay";
    }

    if (player.numbers.length === 6) {
      const uniqueP = uniqueHitProb(state, player);
      const go = uniqueP + t.risk + (need > 40 ? 0.08 : 0);
      const bar = t.risk < -0.05 ? 0.5 : diff === "easy" ? 0.42 : 0.34;
      return go > bar ? "hit" : "stay";
    }

    if (stay >= t.bankFloor && bust > 0.15 - t.risk) {
      if (gap >= -28 || stay >= t.bankFloor + 8) return "stay";
    }

    if (player.totalScore + stay >= state.goal && stay >= (t.hit < 0 ? 8 : 12)) {
      const rivals = state.players.filter((p) => p.id !== player.id && p.status === "active");
      const someoneHot = rivals.some((p) => p.numbers.length >= 5 || p.hasSeven);
      if (!someoneHot && bust > 0.16 - t.risk) return "stay";
    }

    if (active.length === 1 && stay >= 26 - t.hit * 0.3 && bust > 0.2) {
      if (!t.huntSeven || stay >= 40) return "stay";
    }

    let threshold = stay - t.hit;
    if (gap < -30) threshold -= 6;
    if (gap < -60) threshold -= 6;
    if (need <= stay && bust > 0.2) threshold += 8;
    if (RiskSeven.cards.hasDouble(player) && stay >= 24) threshold += 5;
    if (stay <= 8) threshold -= 10;
    if (player.numbers.length >= 5) threshold -= 3;

    if (diff === "sharp") {
      return ev >= threshold - 1 ? "hit" : "stay";
    }
    return ev + (rng() - 0.5) * 3 >= threshold ? "hit" : "stay";
  }

  function threatScore(state, me, other) {
    if (other.status !== "active") return -1;
    let t = other.roundScore || RiskSeven.cards.scoreRound(other);
    t += other.numbers.length * 7;
    t += other.totalScore * 0.08;
    if (RiskSeven.cards.hasDouble(other)) t += 16;
    if (other.numbers.length === 6) t += 36;
    if (other.numbers.length === 5) t += 14;
    if (other.secondChance) t += 6;
    if (other.totalScore + (other.roundScore || 0) >= state.goal) t += 40;
    if (other.id === me.id) t -= 12;
    return t;
  }

  function draw3BustChance(state, target) {
    if (target.secondChance) return bustProb(state, target) * 0.35;
    const p = bustProb(state, target);
    return 1 - Math.pow(1 - p, 3);
  }

  function roundPts(p) {
    return p.roundScore != null ? p.roundScore : RiskSeven.cards.scoreRound(p);
  }

  function pickId(rng, list) {
    return list[Math.floor(rng() * list.length)].id;
  }

  function sortFreeze(state, player, open, style) {
    const copy = open.slice();
    if (style === "hot") {
      copy.sort((a, b) => b.numbers.length - a.numbers.length || threatScore(state, player, b) - threatScore(state, player, a));
    } else if (style === "lead") {
      copy.sort((a, b) => b.totalScore - a.totalScore || threatScore(state, player, b) - threatScore(state, player, a));
    } else if (style === "score") {
      copy.sort((a, b) => roundPts(b) - roundPts(a) || b.numbers.length - a.numbers.length);
    } else if (style === "closer") {
      copy.sort((a, b) => {
        const cook = (p) => (p.numbers.length >= 5 ? 80 : 0) + p.numbers.length * 18 + roundPts(p);
        return cook(b) - cook(a);
      });
    } else {
      copy.sort((a, b) => threatScore(state, player, b) - threatScore(state, player, a));
    }
    return copy;
  }

  function decideTarget(state, player, card, candidates, opts) {
    const rng = (opts && opts.rng) || Math.random;
    const diff = (opts && opts.difficulty) || state.difficulty || "normal";
    const list = candidates.slice();
    if (!list.length) return player.id;
    const t = traits(player.persona);

    if (diff === "easy" && rng() < 0.72) {
      return pickId(rng, list);
    }

    if (card.kind === "secondChance") {
      if (t.spareStyle === "random") return pickId(rng, list);
      const ranked = list.slice();
      if (t.spareStyle === "behind") {
        ranked.sort((a, b) => a.totalScore - b.totalScore || threatScore(state, player, a) - threatScore(state, player, b));
      } else if (t.spareStyle === "self") {
        ranked.sort((a, b) => {
          const sa = a.id === player.id ? -50 : 0;
          const sb = b.id === player.id ? -50 : 0;
          return sa - sb || a.totalScore - b.totalScore;
        });
      } else {
        ranked.sort((a, b) => threatScore(state, player, a) - threatScore(state, player, b));
      }
      return ranked[0].id;
    }

    if (card.kind === "freeze") {
      let open = list.filter((p) => p.status === "active");
      if (!open.length) return player.id;
      if (t.freezeStyle === "random" && rng() < 0.55) {
        const others = open.filter((p) => p.id !== player.id);
        return pickId(rng, others.length ? others : open);
      }
      if (t.freezeStyle === "closer") {
        const cooked = open.filter((p) => p.numbers.length >= 5);
        if (cooked.length) open = cooked;
      }
      const ranked = sortFreeze(state, player, open, t.freezeStyle);
      if (t.freezeSelf > 0 && open.some((p) => p.id === player.id)) {
        const mine = roundPts(player);
        if (mine >= t.bankFloor && rng() < t.freezeSelf) return player.id;
      }
      const best = ranked[0];
      if (best.id === player.id && ranked.length > 1 && t.freezeSelf < 0.2) return ranked[1].id;
      return best.id;
    }

    if (card.kind === "draw3") {
      const others = list.filter((p) => p.id !== player.id && p.status === "active");
      if (t.chaos && others.length && rng() < t.chaos) return pickId(rng, others);
      if (others.length && rng() < t.giveTriple) {
        others.sort((a, b) => {
          const va = draw3BustChance(state, a) * 50 + threatScore(state, player, a) * 0.3;
          const vb = draw3BustChance(state, b) * 50 + threatScore(state, player, b) * 0.3;
          return vb - va;
        });
        return others[0].id;
      }
      const scored = list.map((p) => {
        const pBust = draw3BustChance(state, p);
        const self = p.id === player.id;
        let v = 0;
        if (self) {
          v = hitEV(state, player) * 0.55 + t.drawSelf * 14;
          if (player.numbers.length >= 4 && !player.secondChance) v -= 22;
          if (player.numbers.length <= 1) v += 8;
          if (t.huntSeven && player.numbers.length < 5) v += 12;
        } else {
          v = pBust * 48 + threatScore(state, player, p) * 0.3;
          if (p.numbers.length >= 6) v -= 18;
          if (p.numbers.length >= 3 && p.numbers.length <= 5 && !p.secondChance) v += 10;
          if (p.numbers.length <= 1) v -= 4;
        }
        return { id: p.id, v };
      });
      scored.sort((a, b) => b.v - a.v);
      return scored[0].id;
    }

    return list[0].id;
  }

  function lineFor(player, kind, rng) {
    const pack = LINES[player.persona];
    if (!pack || !pack[kind]) return "";
    return pick(rng || Math.random, pack[kind]);
  }

  function explainHitStay(state, player, choice) {
    const voice = lineFor(player, choice === "hit" ? "hit" : "stay");
    const bust = Math.round(bustProb(state, player) * 100);
    const n = player.numbers.length;
    const score = RiskSeven.cards.scoreRound(player);
    const t = traits(player.persona);
    let why = "";
    if (choice === "hit") {
      if (t.huntSeven) why = n === 6 ? "Six down. Going for seven." : "Not seven yet.";
      else if (player.secondChance) why = `Spare is up. Hitting ${score}.`;
      else if (n === 6) why = `Six unique. Bust ${bust}%.`;
      else if (n <= 2) why = `Only ${n} so far. Cheap hit.`;
      else why = `${score} on the felt. Bust ${bust}%.`;
    } else {
      if (t.huntSeven) why = `Banking ${score}.`;
      else if (n === 6) why = `Six cards, ${bust}% bust. Banking ${score}.`;
      else if (score >= 30) why = `${score} is enough.`;
      else why = `Banking ${score}. Bust was ${bust}%.`;
    }
    if (voice && why) return `${voice} ${why}`;
    return voice || why;
  }

  function explainTarget(state, player, card, targetId) {
    const kind = card.kind === "freeze" ? "freeze" : card.kind === "draw3" ? "draw3" : "sc";
    const voice = lineFor(player, kind);
    const dest = state.players.find((p) => p.id === targetId) || player;
    const self = dest.id === player.id;
    const tScore = roundPts(dest);
    const t = traits(player.persona);
    let why = "";
    if (card.kind === "freeze") {
      if (self) why = `Locking my ${tScore} before I get greedy.`;
      else if (t.freezeStyle === "closer" && dest.numbers && dest.numbers.length >= 5) {
        why = `${dest.name} cooked long enough. Locking ${tScore}.`;
      } else if (t.freezeStyle === "lead") {
        why = `${dest.name} is the match problem. Locked.`;
      } else if (dest.numbers && dest.numbers.length >= 5) {
        why = `${dest.name} is close to seven. Locking ${tScore}.`;
      } else {
        why = `${dest.name} has ${tScore} this round. Locked.`;
      }
    } else if (card.kind === "draw3") {
      if (self) why = t.huntSeven || t.drawSelf > 0.3 ? "I'll take the three." : "My line is still thin. I'll take the three.";
      else why = `${dest.name} looks exposed. Three more — about ${Math.round(draw3BustChance(state, dest) * 100)}% to bust.`;
    } else if (card.kind === "secondChance") {
      why = self ? "I'll keep the Spare." : `${dest.name} can use this more than I can.`;
    } else {
      why = `Playing it on ${self ? "myself" : dest.name}.`;
    }
    if (voice && why) return `${voice} ${why}`;
    return voice || why;
  }

  function thinkMs(player, difficulty) {
    const base = difficulty === "easy" ? 900 : difficulty === "sharp" ? 1400 : 1150;
    return base + traits(player.persona).think + Math.floor(Math.random() * 400);
  }

  RiskSeven.AI = {
    decideHitStay,
    decideTarget,
    bustProb,
    hitEV,
    lineFor,
    explainHitStay,
    explainTarget,
    thinkMs,
    LINES,
    traits,
  };

  if (typeof module !== "undefined") module.exports = RiskSeven.AI;
})(typeof globalThis !== "undefined" ? globalThis : this);
