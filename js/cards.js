/* Risk Seven cards, deck, scoring. Shared by engine, AI, and tests. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});

  const PLUS_VALUES = [2, 4, 6, 8, 10];
  const GOAL_DEFAULT = 200;

  function createDeck() {
    const cards = [];
    cards.push({ id: "n-0-0", type: "number", value: 0 });
    for (let value = 1; value <= 12; value++) {
      for (let copy = 0; copy < value; copy++) {
        cards.push({ id: `n-${value}-${copy}`, type: "number", value });
      }
    }
    for (let i = 0; i < 3; i++) {
      cards.push({ id: `a-freeze-${i}`, type: "action", kind: "freeze" });
      cards.push({ id: `a-draw3-${i}`, type: "action", kind: "draw3" });
      cards.push({ id: `a-sc-${i}`, type: "action", kind: "secondChance" });
    }
    PLUS_VALUES.forEach((plus) => {
      cards.push({ id: `m-plus-${plus}`, type: "modifier", kind: "plus", plus });
    });
    cards.push({ id: "m-double", type: "modifier", kind: "double" });
    return cards;
  }

  function deckComposition(cards) {
    const counts = { numbers: {}, actions: {}, modifiers: {} };
    for (const c of cards) {
      if (c.type === "number") counts.numbers[c.value] = (counts.numbers[c.value] || 0) + 1;
      else if (c.type === "action") counts.actions[c.kind] = (counts.actions[c.kind] || 0) + 1;
      else {
        const key = c.kind === "plus" ? `+${c.plus}` : "x2";
        counts.modifiers[key] = (counts.modifiers[key] || 0) + 1;
      }
    }
    return counts;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function hasDouble(player) {
    return player.modifiers.some((m) => m.kind === "double");
  }

  function plusTotal(player) {
    return player.modifiers.reduce((s, m) => s + (m.kind === "plus" ? m.plus : 0), 0);
  }

  function numberTotal(player) {
    return player.numbers.reduce((s, c) => s + c.value, 0);
  }

  function scoreRound(player) {
    if (player.status === "busted") return 0;
    const base = numberTotal(player);
    const doubled = hasDouble(player) ? base * 2 : base;
    return doubled + plusTotal(player) + (player.hasSeven ? 15 : 0);
  }

  function scoreBreakdown(player) {
    if (player.status === "busted") {
      return { busted: true, base: 0, doubled: false, plus: 0, bonus: 0, total: 0 };
    }
    const base = numberTotal(player);
    const doubled = hasDouble(player);
    const plus = plusTotal(player);
    const bonus = player.hasSeven ? 15 : 0;
    return {
      busted: false,
      base,
      doubled,
      plus,
      bonus,
      total: (doubled ? base * 2 : base) + plus + bonus,
    };
  }

  function cardLabel(card) {
    if (!card) return "";
    if (card.type === "number") return String(card.value);
    if (card.kind === "plus") return `+${card.plus}`;
    if (card.kind === "double") return "×2";
    if (card.kind === "freeze") return "Lock";
    if (card.kind === "draw3") return "Triple";
    if (card.kind === "secondChance") return "Spare";
    return card.kind || card.type;
  }

  function cardShort(card) {
    if (!card) return "";
    if (card.type === "number") return String(card.value);
    if (card.kind === "plus") return `+${card.plus}`;
    if (card.kind === "double") return "×2";
    if (card.kind === "freeze") return "FRZ";
    if (card.kind === "draw3") return "×3";
    if (card.kind === "secondChance") return "2nd";
    return "?";
  }

  function isAssignable(card) {
    return card && (card.kind === "freeze" || card.kind === "draw3" || card.kind === "secondChance");
  }

  function heldNumbers(player) {
    return new Set(player.numbers.map((c) => c.value));
  }

  RiskSeven.cards = {
    PLUS_VALUES,
    GOAL_DEFAULT,
    createDeck,
    deckComposition,
    mulberry32,
    shuffle,
    hasDouble,
    plusTotal,
    numberTotal,
    scoreRound,
    scoreBreakdown,
    cardLabel,
    cardShort,
    isAssignable,
    heldNumbers,
  };

  if (typeof module !== "undefined") module.exports = RiskSeven.cards;
})(typeof globalThis !== "undefined" ? globalThis : this);
