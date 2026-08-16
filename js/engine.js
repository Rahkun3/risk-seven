/* Risk Seven match engine. Async so the table can animate between steps. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});
  const C = () => RiskSeven.cards;

  const PERSONAS = {
    rex: {
      id: "rex",
      name: "Rex",
      title: "Hot hand",
      blurb: "Never banks early. Hits until seven unique numbers — or busts trying.",
      portrait: "assets/rex.jpg",
    },
    ivy: {
      id: "ivy",
      name: "Ivy",
      title: "Ice banker",
      blurb: "Counts the deck. Banks the moment the math turns, and Locks the real threat.",
      portrait: "assets/ivy.jpg",
    },
    max: {
      id: "max",
      name: "Max",
      title: "Wildcard",
      blurb: "Unpredictable. Hands out Triple for sport and sometimes hits just because.",
      portrait: "assets/max.jpg",
    },
    cal: {
      id: "cal",
      name: "Cal",
      title: "Grinder",
      blurb: "Slow and stubborn. Builds a living, then Locks whoever is winning the match.",
      portrait: "assets/cal.jpg",
    },
    noa: {
      id: "noa",
      name: "Noa",
      title: "Tight book",
      blurb: "Banks small piles. Locks their own hand to stop themselves, and hates Triple.",
      portrait: "assets/noa.jpg",
    },
    kit: {
      id: "kit",
      name: "Kit",
      title: "Closer",
      blurb: "Lets a line get hot, then Locks it. Lives to stop a seven.",
      portrait: "assets/kit.jpg",
    },
    sol: {
      id: "sol",
      name: "Sol",
      title: "High roller",
      blurb: "Hits like the deck owes them. Takes Triple personally and banks only huge stacks.",
      portrait: "assets/sol.jpg",
    },
    bea: {
      id: "bea",
      name: "Bea",
      title: "Even keel",
      blurb: "Balanced hits. Hands Spare to whoever is losing, and Locks the match leader.",
      portrait: "assets/bea.jpg",
    },
  };

  function makePlayer(spec) {
    return {
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      persona: spec.persona || null,
      portrait: spec.portrait || "assets/you.jpg",
      title: spec.title || "",
      totalScore: 0,
      numbers: [],
      modifiers: [],
      secondChance: false,
      pendingActions: [],
      received: [],
      status: "active",
      hasSeven: false,
      staging: null,
      lastLine: "",
    };
  }

  function who(name, they) {
    return `${name} ${they}`;
  }

  function resetRoundPlayer(p) {
    p.numbers = [];
    p.modifiers = [];
    p.secondChance = false;
    p.pendingActions = [];
    p.received = [];
    p.status = "active";
    p.hasSeven = false;
    p.staging = null;
  }

  const FX_WAIT = {
    curtain: 1650,
    special: 1050,
    save: 1150,
    bust: 1150,
    seven: 2900,
    freeze: 1100,
    spareKeep: 1100,
    tripleLand: 700,
  };

  function collectInPlay(players) {
    const out = [];
    for (const p of players) {
      out.push(...p.numbers, ...p.modifiers);
      if (p.secondChance) out.push({ id: `held-sc-${p.id}`, type: "action", kind: "secondChance" });
      out.push(...p.pendingActions);
      out.push(...(p.received || []));
      if (p.staging) out.push(p.staging);
    }
    return out;
  }

  class Game {
    constructor(opts) {
      const cards = C();
      this.goal = opts.goal || cards.GOAL_DEFAULT;
      this.difficulty = opts.difficulty || "normal";
      this.animMs = opts.animMs != null ? opts.animMs : 1200;
      this.rng = opts.rng || Math.random;
      this.sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
      this.onUpdate = opts.onUpdate || (() => {});
      this.askHitStay = opts.askHitStay;
      this.askTarget = opts.askTarget;
      this.ackRoundEnd = opts.ackRoundEnd || (async () => {});
      this.players = opts.players.map(makePlayer);
      this.round = 0;
      this.dealerIndex = 0;
      this.currentIndex = 0;
      this.deck = [];
      this.discard = [];
      this.phase = "idle";
      this.prompt = null;
      this.sevenId = null;
      this.log = [];
      this.roundResults = null;
      this.winners = [];
      this.stopped = false;
      this.waiting = null;
      this.forcedDeck = opts.deck || null;
    }

    snapshot() {
      return {
        goal: this.goal,
        difficulty: this.difficulty,
        round: this.round,
        dealerIndex: this.dealerIndex,
        currentIndex: this.currentIndex,
        deckCount: this.deck.length,
        discardCount: this.discard.length,
        remaining: this.deck.slice(),
        discard: this.discard.slice(),
        phase: this.phase,
        prompt: this.prompt,
        sevenId: this.sevenId,
        log: this.log.slice(-12),
        fullLog: this.log.slice(),
        players: this.players.map((p) => ({
          ...p,
          numbers: p.numbers.slice(),
          modifiers: p.modifiers.slice(),
          pendingActions: p.pendingActions.slice(),
          received: (p.received || []).slice(),
          roundScore: C().scoreRound(p),
          breakdown: C().scoreBreakdown(p),
        })),
        roundResults: this.roundResults,
        winners: this.winners.slice(),
        waiting: this.waiting,
      };
    }

    emit() {
      this.onUpdate(this.snapshot());
    }

    pauseFor(kind) {
      if (!this.animMs) return this.sleep(0);
      return this.sleep(FX_WAIT[kind] != null ? FX_WAIT[kind] : this.animMs);
    }

    pushLog(text, kind) {
      this.log.push({ text, kind: kind || "info", t: Date.now() });
      this.emit();
    }

    stop() {
      this.stopped = true;
    }

    activePlayers() {
      return this.players.filter((p) => p.status === "active");
    }

    remainingCards() {
      return this.deck.slice();
    }

    draw() {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) return null;
        this.deck = C().shuffle(this.discard, this.rng);
        this.discard = [];
        this.pushLog("The discard is shuffled back into the deck.", "shuffle");
      }
      return this.deck.pop();
    }

    discardCard(card) {
      if (card) this.discard.push(card);
    }

    async playMatch() {
      this.deck = this.forcedDeck
        ? this.forcedDeck.slice()
        : C().shuffle(C().createDeck(), this.rng);
      this.discard = [];
      this.round = 0;
      this.winners = [];
      this.emit();
      while (!this.stopped && this.winners.length === 0) {
        await this.playRound();
        if (this.stopped) break;
        this.checkGameEnd();
      }
      if (this.winners.length) {
        this.phase = "gameOver";
        this.emit();
      }
    }

    checkGameEnd() {
      const max = Math.max(...this.players.map((p) => p.totalScore));
      if (max < this.goal) return;
      const tops = this.players.filter((p) => p.totalScore === max);
      if (tops.length === 1) {
        this.winners = tops;
        this.pushLog(`${tops[0].name} wins with ${tops[0].totalScore} points.`, "win");
      } else {
        this.pushLog(
          `${tops.map((p) => p.name).join(" and ")} are tied at ${max}. Play another round.`,
          "system"
        );
      }
    }

    async playRound() {
      this.round += 1;
      this.sevenId = null;
      this.roundResults = null;
      this.phase = "dealing";
      this.players.forEach(resetRoundPlayer);
      this.log = [];
      this.pushLog(`Round ${this.round} begins.`, "round");
      await this.pauseFor("curtain");

      const n = this.players.length;
      const start = (this.dealerIndex + 1) % n;
      this.currentIndex = start;

      for (let i = 0; i < n; i++) {
        if (this.stopped || this.sevenId) break;
        const p = this.players[(start + i) % n];
        if (p.status !== "active") continue;
        await this.dealTo(p);
      }

      this.phase = "play";
      this.currentIndex = start;
      let guard = 0;
      while (!this.stopped && !this.sevenId && this.activePlayers().length > 0) {
        if (++guard > 800) throw new Error("Round loop ran away");
        const p = this.players[this.currentIndex];
        if (p.status !== "active") {
          this.advance();
          continue;
        }
        this.phase = "play";
        this.waiting = { kind: "hitStay", playerId: p.id };
        this.prompt = { kind: "hitStay", playerId: p.id };
        this.emit();
        const choice = await this.askHitStay(this.snapshot(), p);
        this.waiting = null;
        this.prompt = null;
        if (this.stopped) return;
        if (choice === "stay") {
          p.status = "stayed";
          p.lastLine = "Stay.";
          this.pushLog(
            `${who(p.name, "stays")} with ${C().scoreRound(p)} points.`,
            p.kind === "human" ? "you" : "ai"
          );
          this.emit();
          await this.sleep(Math.min(800, this.animMs));
        } else {
          const card = await this.dealTo(p);
          if (!card) {
            p.status = "stayed";
            this.pushLog(`${who(p.name, "stays")}. No cards are left to draw.`, "system");
          }
        }
        if (this.sevenId) break;
        this.advance();
      }

      await this.finishRound();
    }

    advance() {
      this.currentIndex = (this.currentIndex + 1) % this.players.length;
    }

    async dealTo(player) {
      if (player.status !== "active") return null;
      const card = this.draw();
      if (!card) return null;
      await this.reveal(player, card);
      await this.resolveCard(player, card, { duringDraw3: false });
      return card;
    }

    async reveal(player, card) {
      player.staging = card;
      this.phase = "reveal";
      this.emit();
      await this.sleep(this.animMs);
    }

    async resolveCard(player, card, ctx) {
      const cards = C();

      if (card.type === "number") {
        player.staging = null;
        const dup = player.numbers.some((c) => c.value === card.value);
        if (dup) {
          if (player.secondChance) {
            player.secondChance = false;
            this.discardCard(card);
            this.discardCard({
              id: `sc-used-${player.id}-${Date.now()}`,
              type: "action",
              kind: "secondChance",
            });
            this.pushLog(
              `${who(player.name, "uses")} Spare and discards a duplicate ${card.value}.`,
              "save"
            );
          } else {
            player.status = "busted";
            player.numbers.push(card);
            this.pushLog(`${who(player.name, "busts")} on ${card.value}.`, "bust");
          }
        } else {
          player.numbers.push(card);
          if (player.numbers.length >= 7) {
            player.hasSeven = true;
            this.sevenId = player.id;
            this.pushLog(`${who(player.name, "collects")} seven unique numbers and scores +15.`, "seven");
          }
        }
        this.emit();
        if (player.hasSeven) await this.pauseFor("seven");
        else if (player.status === "busted") await this.pauseFor("bust");
        else if (player.secondChance === false && dup) await this.pauseFor("save");
        return;
      }

      if (card.type === "modifier") {
        player.staging = null;
        player.modifiers.push(card);
        this.pushLog(`${who(player.name, "draws")} ${cards.cardLabel(card)}.`, "mod");
        this.emit();
        await this.pauseFor("special");
        return;
      }

      if (card.kind === "secondChance") {
        await this.giveSecondChance(player);
        player.staging = null;
        this.emit();
        return;
      }

      if (card.kind === "freeze" || card.kind === "draw3") {
        if (ctx.duringDraw3) {
          player.staging = null;
          player.pendingActions.push(card);
          this.pushLog(
            `${who(player.name, "sets")} ${cards.cardLabel(card)} aside until Triple is finished.`,
            "action"
          );
          this.emit();
          return;
        }
        await this.playAction(player, card);
        player.staging = null;
        this.emit();
      }
    }

    async giveSecondChance(from) {
      if (from.status === "active" && !from.secondChance) {
        from.secondChance = true;
        this.pushLog(`${who(from.name, "keeps")} Spare.`, "info");
        this.emit();
        await this.pauseFor("spareKeep");
        return;
      }
      const candidates = this.players.filter(
        (p) => p.id !== from.id && p.status === "active" && !p.secondChance
      );
      if (candidates.length === 0) {
        this.discardCard({ id: `sc-discard-${Date.now()}`, type: "action", kind: "secondChance" });
        this.pushLog("Spare is discarded. No one can take it.", "system");
        this.emit();
        return;
      }
      const target = await this.chooseTarget(
        from,
        { type: "action", kind: "secondChance" },
        candidates
      );
      if (!target) {
        this.discardCard({ id: `sc-discard-${Date.now()}`, type: "action", kind: "secondChance" });
        return;
      }
      target.secondChance = true;
      this.pushLog(`${who(from.name, "passes")} Spare to ${target.name}.`, "action");
      this.emit();
      await this.pauseFor("special");
    }

    freezeTargets() {
      return this.players.filter((p) => p.status === "active");
    }

    async playAction(from, card) {
      const candidates = card.kind === "freeze" ? this.freezeTargets() : this.activePlayers();
      if (candidates.length === 0) {
        from.staging = null;
        this.discardCard(card);
        if (card.kind === "freeze") this.pushLog("Lock is discarded. No one is still in the round.", "system");
        this.emit();
        return;
      }
      const target = await this.chooseTarget(from, card, candidates);
      from.staging = null;
      if (!target) {
        this.discardCard(card);
        this.emit();
        return;
      }
      await this.resolveAction(from, card, target);
    }

    async chooseTarget(from, card, candidates) {
      if (!candidates.length) return null;
      if (
        candidates.length === 1 &&
        card.kind === "freeze" &&
        (from.kind !== "human" || candidates[0].id === from.id)
      ) {
        return candidates[0];
      }
      if (candidates.length === 1 && from.kind !== "human" && card.kind !== "draw3") {
        return candidates[0];
      }
      for (;;) {
        if (this.stopped) return null;
        this.phase = "target";
        this.waiting = {
          kind: "target",
          playerId: from.id,
          card,
          candidateIds: candidates.map((p) => p.id),
        };
        this.prompt = this.waiting;
        this.emit();
        const id = await this.askTarget(this.snapshot(), from, card, candidates);
        this.waiting = null;
        this.prompt = null;
        if (this.stopped) return null;
        const picked = candidates.find((p) => p.id === id);
        if (picked) return picked;
        if (from.kind !== "human") return candidates[0];
      }
    }

    async resolveAction(from, card, target) {
      if (!target) {
        this.discardCard(card);
        return;
      }
      const cards = C();
      if (card.kind === "freeze") {
        if (target.status !== "active") {
          this.discardCard(card);
          this.pushLog(`${target.name} is already out. Lock does nothing.`, "system");
          this.emit();
          return;
        }
        target.received = target.received || [];
        target.received.push(card);
        target.status = "frozen";
        target.lastLine = "Frozen.";
        const n = cards.scoreRound(target);
        const aim = from.id === target.id ? "themselves" : target.name;
        this.pushLog(`${who(from.name, "freezes")} ${aim} with ${n} points.`, "freeze");
        this.emit();
        await this.pauseFor("freeze");
        this.clearReceived(target, "freeze");
        this.emit();
        return;
      }
      if (card.kind === "draw3") {
        target.received = target.received || [];
        target.received.push(card);
        const aim = from.id === target.id ? "themselves" : target.name;
        this.pushLog(`${who(from.name, "plays")} Triple on ${aim}.`, "draw3");
        this.emit();
        await this.pauseFor("tripleLand");
        await this.doDraw3(target);
        this.clearReceived(target, "draw3");
        this.emit();
      }
    }

    clearReceived(player, kind) {
      const keep = [];
      (player.received || []).forEach((c) => {
        if (c.kind === kind) this.discardCard(c);
        else keep.push(c);
      });
      player.received = keep;
    }

    async doDraw3(player) {
      for (let i = 0; i < 3; i++) {
        if (this.stopped || player.status !== "active" || this.sevenId) break;
        const card = this.draw();
        if (!card) break;
        this.pushLog(`${who(player.name, "draws")} card ${i + 1} of 3: ${C().cardLabel(card)}.`, "draw3");
        await this.reveal(player, card);
        await this.resolveCard(player, card, { duringDraw3: true });
      }

      const pending = player.pendingActions.splice(0);
      if (player.status !== "active" || this.sevenId) {
        pending.forEach((c) => this.discardCard(c));
        if (pending.length && (player.status === "busted" || this.sevenId)) {
          this.pushLog("Set-aside action cards are discarded.", "system");
        }
        this.emit();
        return;
      }
      for (const action of pending) {
        if (this.stopped || this.sevenId) {
          this.discardCard(action);
          continue;
        }
        await this.playAction(player, action);
      }
    }

    async finishRound() {
      if (this.stopped) return;
      const cards = C();
      const results = this.players.map((p) => {
        const pts = cards.scoreRound(p);
        if (p.status !== "busted") p.totalScore += pts;
        return {
          id: p.id,
          name: p.name,
          kind: p.kind,
          portrait: p.portrait,
          status: p.status,
          hasSeven: p.hasSeven,
          pts: p.status === "busted" ? 0 : pts,
          breakdown: cards.scoreBreakdown(p),
          totalScore: p.totalScore,
          numbers: p.numbers.slice(),
          modifiers: p.modifiers.slice(),
        };
      });
      this.roundResults = results;

      for (const p of this.players) {
        this.discard.push(...p.numbers, ...p.modifiers, ...p.pendingActions, ...(p.received || []));
        if (p.staging) this.discard.push(p.staging);
        if (p.secondChance) {
          this.discard.push({
            id: `sc-end-${p.id}-${this.round}`,
            type: "action",
            kind: "secondChance",
          });
        }
        p.staging = null;
        p.pendingActions = [];
        p.received = [];
      }

      this.phase = "roundEnd";
      this.prompt = { kind: "roundEnd" };
      this.emit();
      await this.ackRoundEnd(this.snapshot());
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
      this.prompt = null;
    }
  }

  RiskSeven.PERSONAS = PERSONAS;
  RiskSeven.Game = Game;
  RiskSeven.FX_WAIT = FX_WAIT;
  RiskSeven.makePlayer = makePlayer;
  RiskSeven.collectInPlay = collectInPlay;

  if (typeof module !== "undefined") {
    module.exports = { Game, PERSONAS, FX_WAIT, makePlayer, collectInPlay };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
