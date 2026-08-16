(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    game: null,
    snap: null,
    waiter: null,
    lastLog: 0,
    lastFx: null,
    debug: false,
    mode: "local",
    myId: "you",
    onlineRole: "player",
    pendingJoin: "",
    settings: {
      name: "You",
      opponents: 3,
      difficulty: "normal",
      goal: 200,
      avatar: "f1",
    },
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem("rs-settings");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.name) state.settings.name = String(saved.name).slice(0, 16);
      if (saved.avatar) state.settings.avatar = RiskSeven.looks.normalize(saved.avatar);
      if (saved.difficulty === "easy" || saved.difficulty === "normal" || saved.difficulty === "sharp") {
        state.settings.difficulty = saved.difficulty;
      }
    } catch (e) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        "rs-settings",
        JSON.stringify({
          name: state.settings.name,
          avatar: state.settings.avatar,
          difficulty: state.settings.difficulty,
        })
      );
    } catch (e) {}
  }

  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return;
    }
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    el.remove();
  }

  function rosterIds() {
    return Object.keys(RiskSeven.PERSONAS);
  }

  function shuffleIds(ids) {
    const a = ids.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickOpponents(n) {
    return shuffleIds(rosterIds()).slice(0, n);
  }

  function syncDiffHelp() {
    const el = $("diff-help");
    if (!el) return;
    const copy = {
      easy: "Easy — AI banks early and misses some threats.",
      normal: "Normal — AI plays a fair, mixed game.",
      sharp: "Sharp — AI counts the deck and plays to win.",
    };
    el.textContent = copy[state.settings.difficulty] || copy.normal;
  }

  function setPillGroup(group, value) {
    document.querySelectorAll(`[data-group="${group}"]`).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === String(value));
    });
  }

  function setupMenu() {
    document.querySelectorAll(".pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.dataset.group;
        const value = btn.dataset.value;
        if (group === "difficulty") {
          state.settings.difficulty = value;
          saveSettings();
          syncDiffHelp();
        }
        setPillGroup(group, value);
        renderRivals();
      });
    });
    loadSettings();
    $("player-name").value = state.settings.name;
    renderLooks();
    setPillGroup("difficulty", state.settings.difficulty);
    syncDiffHelp();
    $("player-name").addEventListener("input", (e) => {
      state.settings.name = e.target.value.slice(0, 16) || "You";
      saveSettings();
    });
    $("play").addEventListener("click", () => {
      unlockAudio();
      startMatch();
    });
    $("play-online").addEventListener("click", () => {
      unlockAudio();
      openOnline();
    });
    $("btn-online-back").addEventListener("click", () => $("online-panel").classList.remove("show"));
    $("btn-create-table").addEventListener("click", () => onlineCreate());
    $("btn-join-code").addEventListener("click", () => onlineJoinCode());
    $("join-code").addEventListener("keydown", (e) => {
      if (e.key === "Enter") onlineJoinCode();
    });
    $("btn-lobby-start").addEventListener("click", () => RiskSeven.net.send({ type: "start" }));
    $("btn-lobby-leave").addEventListener("click", () => {
      RiskSeven.net.send({ type: "leave" });
      $("lobby").classList.remove("show");
    });
    $("btn-copy-code").addEventListener("click", () => {
      copyText($("lobby-code").textContent);
    });
    wireNet();
    armAudio();
    $("how").addEventListener("click", () => {
      unlockAudio();
      showRules();
    });
    $("close-rules").addEventListener("click", () => $("rules").classList.remove("show"));
    $("btn-rules").addEventListener("click", () => showRules());
    const flipMusic = () => {
      unlockAudio();
      RiskSeven.music.setEnabled(!RiskSeven.music.uiOn());
      syncMusicUi();
    };
    $("btn-music").addEventListener("click", flipMusic);
    $("music-toggle").addEventListener("click", flipMusic);
    $("btn-sfx").addEventListener("click", () => {
      RiskSeven.sfx.unlock();
      const next = !RiskSeven.sfx.enabled();
      if (!next) RiskSeven.sfx.click();
      RiskSeven.sfx.setEnabled(next);
      if (next) RiskSeven.sfx.click();
      syncSoundUi();
    });
    document.addEventListener("click", (e) => {
      const el = e.target.closest("button, .seat.targetable, .card.assignable");
      if (!el || el.id === "btn-sfx") return;
      unlockAudio();
      RiskSeven.sfx.click();
    });
    $("btn-quit").addEventListener("click", quitToMenu);
    $("hit").addEventListener("click", () => act("hit"));
    $("stay").addEventListener("click", () => act("stay"));
    $("continue").addEventListener("click", () => {
      if (state.waiter && state.waiter.kind === "continue") finishWait(true);
    });
    $("again").addEventListener("click", () => {
      if (state.mode === "online") {
        RiskSeven.net.send({ type: "again" });
        $("again").disabled = true;
        const wait = $("win-wait");
        if (wait) {
          wait.hidden = false;
          wait.textContent = "Waiting for the others…";
        }
        return;
      }
      $("winner").classList.remove("show");
      startMatch();
    });
    $("to-menu").addEventListener("click", () => {
      $("winner").classList.remove("show");
      quitToMenu();
    });
    document.addEventListener("keydown", onKey);
    renderRivals();
    syncMusicUi();
    syncSoundUi();
    const gate = $("sound-gate");
    if (gate) {
      gate.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        unlockAudio();
      });
    }
    if (RiskSeven.audio && RiskSeven.audio.onChange) RiskSeven.audio.onChange(syncSoundGate);
    hideBoot();
    resumeFromUrl();
  }

  function renderLooks() {
    const box = $("avatar-pick");
    if (!box) return;
    box.innerHTML = "";
    RiskSeven.looks.LOOKS.forEach((look) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-opt" + (state.settings.avatar === look.id ? " active" : "");
      btn.dataset.avatar = look.id;
      btn.innerHTML = `<img src="${look.src}" alt="${look.label}"><span>${look.label}</span>`;
      btn.addEventListener("click", () => {
        unlockAudio();
        state.settings.avatar = look.id;
        box.querySelectorAll(".avatar-opt").forEach((b) => b.classList.toggle("active", b === btn));
        saveSettings();
      });
      box.appendChild(btn);
    });
  }

  function syncMusicUi() {
    const on = RiskSeven.music.uiOn();
    ["music-toggle", "btn-music"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle("on", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
      const lab = el.querySelector(".toggle-label");
      if (lab && id === "music-toggle") lab.textContent = on ? "On" : "Off";
    });
  }

  function syncSoundUi() {
    const on = RiskSeven.sfx.enabled();
    const btn = $("btn-sfx");
    if (!btn) return;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  }

  function profile() {
    return {
      name: ($("player-name").value || "You").trim().slice(0, 16) || "You",
      avatar: RiskSeven.looks.normalize(state.settings.avatar),
      tableSize: 4,
      difficulty: state.settings.difficulty,
    };
  }

  function showOnlineErr(text) {
    const el = $("online-err");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }

  async function ensureNet() {
    await RiskSeven.net.connect();
    const p = profile();
    RiskSeven.net.send({
      type: "hello",
      name: p.name,
      avatar: p.avatar,
      sessionId: RiskSeven.net.sessionId(),
    });
  }

  function joinCodeFromUrl() {
    try {
      const params = new URLSearchParams(location.search);
      return String(params.get("join") || params.get("t") || "").trim().toUpperCase();
    } catch (e) {
      return "";
    }
  }

  async function resumeFromUrl() {
    const code = joinCodeFromUrl();
    state.pendingJoin = code;
    try {
      await ensureNet();
      if (code) {
        const p = profile();
        RiskSeven.net.send({ type: "join", code, name: p.name, avatar: p.avatar });
      }
    } catch (err) {
      if (code) {
        $("online-panel").classList.add("show");
        $("join-code").value = code;
        showOnlineErr(err.message || "Start the table with ./start.sh and open the shared internet link.");
      }
    }
  }

  function unlockAudio() {
    if (RiskSeven.audio) RiskSeven.audio.unlock();
    else {
      RiskSeven.sfx.unlock();
      RiskSeven.music.unlock();
    }
    syncSoundGate();
  }

  function armAudio() {
    const kick = () => unlockAudio();
    ["pointerdown", "touchstart", "keydown"].forEach((ev) => {
      window.addEventListener(ev, kick, { capture: true });
    });
  }

  function syncSoundGate() {
    const gate = $("sound-gate");
    if (!gate) return;
    const atTable = $("table") && $("table").classList.contains("show");
    const ready = RiskSeven.audio && RiskSeven.audio.ready();
    gate.hidden = !atTable || !!ready;
  }

  function viewerName() {
    const me = state.snap && state.snap.players.find((p) => p.id === state.myId);
    return (me && me.name) || state.settings.name || "";
  }

  function toYouVerb(verb) {
    const map = {
      stays: "stay",
      uses: "use",
      busts: "bust",
      collects: "collect",
      draws: "draw",
      sets: "set",
      keeps: "keep",
      passes: "pass",
      freezes: "freeze",
      plays: "play",
      wins: "win",
    };
    return map[verb] || verb;
  }

  function forMe(text) {
    const name = viewerName();
    if (!name || !text) return text;
    const escName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let out = text;
    if (out.indexOf(name + " ") === 0) {
      const rest = out.slice(name.length + 1);
      const space = rest.indexOf(" ");
      const verb = space < 0 ? rest : rest.slice(0, space);
      const tail = space < 0 ? "" : rest.slice(space);
      out = "You " + toYouVerb(verb) + tail;
      out = out.replace(/\bthemselves\b/g, "yourself");
    }
    out = out.replace(new RegExp("\\bto " + escName + "\\b", "g"), "to you");
    out = out.replace(new RegExp("\\bon " + escName + "\\b", "g"), "on you");
    return out;
  }

  function showNotice(text) {
    if (!text) return;
    const mid = $("table-notice");
    if (mid) {
      mid.hidden = false;
      mid.textContent = text;
    }
    const note = $("lobby-notice");
    if (note) note.textContent = text;
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(() => {
      if (mid) {
        mid.hidden = true;
        mid.textContent = "";
      }
      if (note) note.textContent = "";
    }, 5200);
  }

  async function openOnline() {
    showOnlineErr("");
    $("online-panel").classList.add("show");
    try {
      await ensureNet();
    } catch (err) {
      showOnlineErr(err.message || "Start the game with ./start.sh so others can join.");
    }
  }

  async function onlineCreate() {
    try {
      await ensureNet();
      const p = profile();
      RiskSeven.net.send({
        type: "create",
        name: p.name,
        avatar: p.avatar,
        tableSize: p.tableSize,
        difficulty: p.difficulty,
      });
    } catch (err) {
      showOnlineErr(err.message || "Could not open a table.");
    }
  }

  async function onlineJoinCode() {
    const code = ($("join-code").value || "").trim();
    if (!code) return;
    try {
      await ensureNet();
      const p = profile();
      RiskSeven.net.send({ type: "join", code, name: p.name, avatar: p.avatar });
    } catch (err) {
      showOnlineErr(err.message || "Could not join.");
    }
  }

  function showLobby(room) {
    $("online-panel").classList.remove("show");
    $("lobby").classList.add("show");
    $("lobby-title").textContent = "Table";
    const isHost = room.hostId === state.myId;
    const invite = document.querySelector(".lobby-invite");
    if (invite) invite.hidden = !isHost;
    $("lobby-code").textContent = room.code;
    const humans = room.seats.filter((s) => s.kind === "human").length;
    $("lobby-fill-note").textContent = isHost
      ? humans >= room.tableSize
        ? "Table is full. Extra people watch until the next hand."
        : `${humans} of ${room.tableSize} seated. Deal when everyone looks ready.`
      : "Waiting for the host to deal.";
    const box = $("lobby-seats");
    box.innerHTML = "";
    room.seats.forEach((s) => {
      const seated = !s.away;
      const el = document.createElement("div");
      el.className = "lobby-seat" + (s.kind === "ai" ? " ai" : "") + (s.away ? " away" : "") + (seated ? " ready" : "");
      let tag;
      if (s.away) tag = "reconnecting";
      else if (s.id === room.hostId) tag = "✓ Ready · host";
      else if (s.kind === "ai") tag = "✓ Ready · AI";
      else tag = "✓ Ready";
      el.innerHTML = `<img src="${s.portrait}" alt=""><div><b>${esc(s.name)}</b><div class="rc-round">${esc(tag)}</div></div>`;
      box.appendChild(el);
    });
    $("lobby-watch").textContent = room.watchers.length
      ? `Watching: ${room.watchers.map((w) => w.name).join(", ")}`
      : "";
    $("btn-lobby-start").hidden = room.hostId !== state.myId || room.playing;
  }

  function showNetBanner(text) {
    const el = $("net-banner");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
  }

  function enterOnlineTable() {
    $("lobby").classList.remove("show");
    $("online-panel").classList.remove("show");
    $("menu").classList.add("hidden");
    $("table").classList.add("show");
    $("round-end").classList.remove("show");
    $("winner").classList.remove("show");
    $("seats").innerHTML = "";
    $("log").innerHTML = "";
    hideAssign();
    unlockAudio();
    RiskSeven.music.enterTable();
    syncMusicUi();
    syncSoundUi();
    syncSoundGate();
  }

  function wireOnlinePrompt(snap) {
    if (state.mode !== "online") return;
    const watch = $("watch-banner");
    if (watch) watch.hidden = state.onlineRole !== "spectate";
    if (state.onlineRole === "spectate") {
      if (state.waiter) finishWait(null);
      return;
    }
    const prompt = snap && snap.prompt;
    if (!prompt || prompt.playerId !== state.myId) return;
    if (prompt.kind === "hitStay" && (!state.waiter || state.waiter.kind !== "hitStay")) {
      if (state.waiter) finishWait(null);
      RiskSeven.sfx.yourTurn();
      wait("hitStay").then((choice) => {
        if (choice) RiskSeven.net.send({ type: "hitStay", choice });
      });
    }
    if (prompt.kind === "target" && (!state.waiter || state.waiter.kind !== "target")) {
      if (state.waiter) finishWait(null);
      wait("target").then((id) => {
        if (id) RiskSeven.net.send({ type: "target", targetId: id });
      });
    }
  }

  function wireNet() {
    if (!RiskSeven.net || state._netWired) return;
    state._netWired = true;
    RiskSeven.net.on("hello", (msg) => {
      if (msg.youId) state.myId = msg.youId;
      showNetBanner("");
      if (state.pendingJoin) {
        const p = profile();
        RiskSeven.net.send({ type: "join", code: state.pendingJoin, name: p.name, avatar: p.avatar });
      }
    });
    RiskSeven.net.on("info", (msg) => {
      if (msg.room && state.mode === "online" && !$("table").classList.contains("show")) showLobby(msg.room);
    });
    RiskSeven.net.on("error", (msg) => showOnlineErr(msg.message || "Something went wrong."));
    RiskSeven.net.on("joined", (msg) => {
      state.mode = "online";
      state.myId = msg.youId;
      state.onlineRole = msg.role;
      state.pendingJoin = "";
      showNetBanner("");
      showLobby(msg.room);
      if (msg.room.playing) enterOnlineTable();
    });
    RiskSeven.net.on("lobby", (msg) => {
      if (state.mode !== "online") return;
      if (!$("table").classList.contains("show")) showLobby(msg.room);
      else {
        $("btn-lobby-start").hidden = msg.room.hostId !== state.myId || msg.room.playing;
      }
    });
    RiskSeven.net.on("match", () => {
      $("winner").classList.remove("show");
      $("lobby").classList.remove("show");
      $("again").disabled = false;
      const wait = $("win-wait");
      if (wait) {
        wait.hidden = true;
        wait.textContent = "";
      }
      state.onlineRole = "player";
      enterOnlineTable();
    });
    RiskSeven.net.on("snap", (msg) => {
      state.mode = "online";
      state.myId = msg.youId;
      state.onlineRole = msg.role || "player";
      if (!$("table").classList.contains("show")) enterOnlineTable();
      onUpdate(msg.snap);
    });
    RiskSeven.net.on("say", (msg) => {
      const p = state.snap && state.snap.players.find((x) => x.id === msg.playerId);
      if (p) sayText(p, msg.text);
    });
    RiskSeven.net.on("notice", (msg) => {
      if (msg.text) showNotice(msg.text);
    });
    RiskSeven.net.on("votes", (msg) => {
      const wait = $("win-wait");
      if (wait) {
        wait.hidden = false;
        wait.textContent = `${msg.have} of ${msg.need} want to play again`;
      }
      if (msg.ids && msg.ids.indexOf(state.myId) >= 0) $("again").disabled = true;
    });
    RiskSeven.net.on("over", (msg) => {
      if (msg.snap) onUpdate(msg.snap);
      $("again").disabled = false;
      const wait = $("win-wait");
      if (wait) {
        wait.hidden = true;
        wait.textContent = "";
      }
      showWinner();
    });
    RiskSeven.net.on("disconnected", () => {
      if (state.mode === "online") showNetBanner("Connection dropped — trying the table again…");
    });
    RiskSeven.net.on("open", () => {
      if (!RiskSeven.net.connected()) return;
      const p = profile();
      RiskSeven.net.send({
        type: "hello",
        name: p.name,
        avatar: p.avatar,
        sessionId: RiskSeven.net.sessionId(),
      });
    });
    RiskSeven.net.on("closed", () => {
      showNetBanner("");
      if (state.mode === "online") {
        showOnlineErr("Disconnected from the table.");
        quitToMenu();
      }
    });
  }

  function hideBoot() {
    const boot = $("boot");
    if (!boot) return;
    const go = () => boot.classList.add("gone");
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(go));
    } else {
      requestAnimationFrame(go);
    }
    setTimeout(go, 1200);
  }

  function renderRivals() {
    const box = $("rivals");
    box.innerHTML = "";
    rosterIds().forEach((id) => {
      const p = RiskSeven.PERSONAS[id];
      const el = document.createElement("div");
      el.className = "rival";
      el.innerHTML = `<img src="${p.portrait}" alt="${p.name}"><div><h3>${p.name} · ${p.title}</h3><span>${p.blurb}</span></div>`;
      box.appendChild(el);
    });
  }

  function showRules() {
    $("rules").classList.add("show");
  }

  function quitToMenu() {
    if (state.mode === "online") {
      try {
        RiskSeven.net.send({ type: "leave" });
      } catch (e) {}
    }
    if (state.game) state.game.stop();
    if (state.waiter) finishWait(null);
    hideAssign();
    $("table").classList.remove("show");
    $("menu").classList.remove("hidden");
    $("round-end").classList.remove("show");
    $("winner").classList.remove("show");
    $("lobby").classList.remove("show");
    $("online-panel").classList.remove("show");
    if ($("watch-banner")) $("watch-banner").hidden = true;
    showNetBanner("");
    if ($("sound-gate")) $("sound-gate").hidden = true;
    state.mode = "local";
    state.myId = "you";
    state.onlineRole = "player";
    RiskSeven.music.leaveTable();
    syncMusicUi();
  }

  function wait(kind) {
    return new Promise((resolve) => {
      state.waiter = { kind, resolve };
      if (kind === "target" && state.snap) showAssign(state.snap);
      else hideAssign();
      updateActions();
    });
  }

  function finishWait(value) {
    if (!state.waiter) return;
    const r = state.waiter.resolve;
    state.waiter = null;
    hideAssign();
    r(value);
  }

  function act(choice) {
    if (!state.waiter || state.waiter.kind !== "hitStay") return;
    RiskSeven.sfx.unlock();
    if (choice === "stay") RiskSeven.sfx.stay();
    finishWait(choice);
  }

  function onKey(e) {
    if (e.target.matches("input")) return;
    const k = e.key.toLowerCase();
    if ($("rules").classList.contains("show") && k === "escape") {
      $("rules").classList.remove("show");
      return;
    }
    if (state.waiter && state.waiter.kind === "hitStay") {
      if (k === "h" || k === " ") {
        e.preventDefault();
        act("hit");
      }
      if (k === "s") act("stay");
    }
    if (state.waiter && state.waiter.kind === "target") {
      const n = Number(e.key);
      if (n >= 1 && n <= 7) {
        const ids = state.snap.prompt && state.snap.prompt.candidateIds;
        if (ids && ids[n - 1]) pickTarget(ids[n - 1]);
      }
    }
    if (state.waiter && state.waiter.kind === "continue" && (k === "enter" || k === " ")) {
      e.preventDefault();
      finishWait(true);
    }
    if (e.key === "`" || e.code === "Backquote") {
      e.preventDefault();
      toggleDebug();
    }
  }

  function toggleDebug() {
    state.debug = !state.debug;
    const el = $("debug-deck");
    if (!el) return;
    el.hidden = !state.debug;
    if (state.debug && state.snap) fillDebug(state.snap);
  }

  function fillDebug(snap) {
    const el = $("debug-deck");
    if (!el || !state.debug) return;
    const rem = (snap.remaining || []).slice().reverse();
    const disc = snap.discard || [];
    const inPlay = [];
    (snap.players || []).forEach((p) => {
      p.numbers.forEach((c) => inPlay.push(`${p.name}: ${RiskSeven.cards.cardLabel(c)}`));
      p.modifiers.forEach((c) => inPlay.push(`${p.name}: ${RiskSeven.cards.cardLabel(c)}`));
      if (p.secondChance) inPlay.push(`${p.name}: Spare`);
      (p.pendingActions || []).forEach((c) => inPlay.push(`${p.name} (set aside): ${RiskSeven.cards.cardLabel(c)}`));
      (p.received || []).forEach((c) => inPlay.push(`${p.name} (assigned): ${RiskSeven.cards.cardLabel(c)}`));
      if (p.staging) inPlay.push(`${p.name} (revealing): ${RiskSeven.cards.cardLabel(p.staging)}`);
    });
    const lines = [
      `Deck ${rem.length}  ·  Discard ${disc.length}  ·  In play ${inPlay.length}`,
      "",
      "— Deck (next draw last) —",
      ...rem.map((c, i) => `${String(rem.length - i).padStart(2, " ")}  ${RiskSeven.cards.cardLabel(c)}`),
      "",
      "— In play —",
      ...(inPlay.length ? inPlay : ["(none)"]),
      "",
      "— Discard —",
      ...(disc.length ? disc.map((c) => RiskSeven.cards.cardLabel(c)) : ["(none)"]),
    ];
    el.textContent = lines.join("\n");
  }

  function pickTarget(id) {
    if (!state.waiter || state.waiter.kind !== "target") return;
    finishWait(id);
  }

  function assignPromptCopy(card) {
    if (card.kind === "freeze") return "Play Lock on…";
    if (card.kind === "draw3") return "Play Triple on…";
    return "Give Spare to…";
  }

  function showAssign(snap) {
    const bar = $("assign-bar");
    if (!bar || !snap.prompt || snap.prompt.kind !== "target") return;
    const card = snap.prompt.card;
    const actor = snap.players.find((p) => p.id === snap.prompt.playerId);
    $("assign-title").textContent = assignPromptCopy(card);
    $("assign-hint").textContent =
      actor && actor.id === state.myId
        ? "Click the card, then a player — or just click a portrait. You can pick yourself."
        : `${actor ? actor.name : "Someone"} is choosing…`;

    const slot = $("assign-card-slot");
    slot.innerHTML = "";
    const preview = cardEl(card, true, false);
    preview.classList.add("assignable", "face-up", "picked");
    preview.addEventListener("click", () => {
      document.querySelectorAll(".seat.targetable").forEach((s) => {
        s.classList.remove("nudge");
        void s.offsetWidth;
        s.classList.add("nudge");
      });
    });
    slot.appendChild(preview);

    const box = $("assign-targets");
    box.innerHTML = "";
    snap.prompt.candidateIds.forEach((id, idx) => {
      const p = snap.players.find((pl) => pl.id === id);
      if (!p) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "assign-btn" + (p.id === state.myId ? " me" : "");
      btn.innerHTML = `<img src="${p.portrait}" alt=""><span>${esc(p.name)}${p.id === state.myId ? " (you)" : ""}</span><small>${idx + 1}</small>`;
      btn.addEventListener("click", () => pickTarget(p.id));
      box.appendChild(btn);
    });
    bar.hidden = false;
  }

  function hideAssign() {
    const bar = $("assign-bar");
    if (bar) bar.hidden = true;
  }

  function startMatch() {
    state.mode = "local";
    state.myId = "you";
    state.onlineRole = "player";
    $("menu").classList.add("hidden");
    $("table").classList.add("show");
    $("round-end").classList.remove("show");
    $("winner").classList.remove("show");
    $("seats").innerHTML = "";
    $("log").innerHTML = "";
    hideAssign();
    unlockAudio();
    RiskSeven.music.enterTable();
    syncMusicUi();
    syncSoundGate();

    const name = ($("player-name").value || "You").trim().slice(0, 16) || "You";
    const players = [
      {
        id: "you",
        name,
        kind: "human",
        persona: null,
        portrait: RiskSeven.looks.src(state.settings.avatar),
        title: "",
      },
    ];
    pickOpponents(3).forEach((pid) => {
        const p = RiskSeven.PERSONAS[pid];
        players.push({
          id: pid,
          name: p.name,
          kind: "ai",
          persona: pid,
          portrait: p.portrait,
          title: p.title,
        });
      });

    const rng = Math.random;
    const game = new RiskSeven.Game({
      players,
      goal: state.settings.goal,
      difficulty: state.settings.difficulty,
      rng,
      animMs: 1200,
      onUpdate: onUpdate,
      askHitStay: async (snap, player) => {
        if (player.kind === "ai") {
          await sleep(RiskSeven.AI.thinkMs(player, snap.difficulty));
          const choice = RiskSeven.AI.decideHitStay(snap, player, {
            rng,
            difficulty: snap.difficulty,
          });
          sayText(player, RiskSeven.AI.explainHitStay(snap, player, choice));
          if (choice === "stay") RiskSeven.sfx.stay();
          return choice;
        }
        RiskSeven.sfx.yourTurn();
        return wait("hitStay");
      },
      askTarget: async (snap, player, card, candidates) => {
        if (player.kind === "ai") {
          await sleep(RiskSeven.AI.thinkMs(player, snap.difficulty));
          const id = RiskSeven.AI.decideTarget(snap, player, card, candidates, {
            rng,
            difficulty: snap.difficulty,
          });
          sayText(player, RiskSeven.AI.explainTarget(snap, player, card, id));
          return id;
        }
        return wait("target");
      },
      ackRoundEnd: async (snap) => {
        const max = Math.max(...snap.players.map((p) => p.totalScore));
        const leaders = snap.players.filter((p) => p.totalScore === max);
        if (max >= snap.goal && leaders.length === 1) return;
        showRoundEnd();
        await autoContinue(2400);
        $("round-end").classList.remove("show");
        if (!state.game || state.game.stopped) return;
        $("log").innerHTML = "";
        await showRoundCurtain(snap.round + 1);
      },
    });

    state.game = game;
    showRoundCurtain(1)
      .then(() => game.playMatch())
      .then(() => {
        if (game.winners.length) showWinner();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  function sayText(player, line) {
    if (!line) return;
    const el = document.querySelector(`[data-seat="${player.id}"] .bubble`);
    if (!el) return;
    el.textContent = line;
    el.classList.add("show");
    RiskSeven.sfx.talk();
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 4200);
  }

  async function showRoundCurtain(round) {
    const el = $("round-curtain");
    if (!el) return;
    $("curtain-label").textContent = `Round ${round}`;
    el.hidden = false;
    el.classList.add("show");
    await sleep(80);
    RiskSeven.sfx.newRound();
    await sleep(1700);
    el.classList.remove("show");
    el.hidden = true;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function holdFx(ms) {
    const until = Date.now() + ms;
    state.fxUntil = Math.max(state.fxUntil || 0, until);
    if (state.fxFlush) clearTimeout(state.fxFlush);
    state.fxFlush = setTimeout(flushHeldSnap, Math.max(16, state.fxUntil - Date.now()));
  }

  function flushHeldSnap() {
    state.fxFlush = null;
    state.fxUntil = 0;
    const held = state.heldSnap;
    state.heldSnap = null;
    if (held) applySnap(held);
  }

  function onUpdate(snap) {
    if (state.fxUntil && Date.now() < state.fxUntil && state.snap) {
      state.heldSnap = snap;
      return;
    }
    applySnap(snap);
  }

  function applySnap(snap) {
    const prev = state.snap;
    const prevRound = prev && prev.round;
    state.snap = snap;
    renderTable(snap);
    if (state.waiter && state.waiter.kind === "target") showAssign(snap);
    else if (!state.waiter || state.waiter.kind !== "target") hideAssign();
    updateActions();
    if (!state._logAt || (snap.log.length && snap.log[snap.log.length - 1].t !== state._logAt)) {
      paintLog(snap);
      if (snap.log.length) state._logAt = snap.log[snap.log.length - 1].t;
    }
    if (state.debug) fillDebug(snap);
    if (snap.log.length && snap.log[snap.log.length - 1].t !== state.lastLog) {
      const last = snap.log[snap.log.length - 1];
      state.lastLog = last.t;
      if (last.kind === "freeze") RiskSeven.sfx.freeze();
      if (last.kind === "win") RiskSeven.sfx.win();
      if (last.kind === "shuffle") flashShuffle();
    }
    maybeFlashSpecial(snap);
    maybeFlashBust(prev, snap);
    maybeFlashSeven(prev, snap);
    maybeFlashSave(prev, snap);
    if (snap.round && snap.round !== prevRound && snap.phase === "dealing") {
      showRoundCurtain(snap.round);
    }
    if (snap.phase === "roundEnd") showRoundEnd();
    else $("round-end").classList.remove("show");
    wireOnlinePrompt(snap);
  }

  function flashShuffle() {
    RiskSeven.sfx.shuffle();
    const fx = $("fx");
    if (fx) {
      fx.className = "show kind-shuffle";
      $("fx-name").textContent = "RESHUFFLE";
      $("fx-who").textContent = "The discard returns to the deck";
      fx.querySelectorAll(".spark, .confetti").forEach((s) => s.remove());
      clearTimeout(fx._t);
      holdFx(1100);
      fx._t = setTimeout(() => {
        fx.className = "";
      }, 1100);
    }
    document.querySelectorAll(".pile .stack").forEach((el) => {
      el.classList.remove("shuffling");
      void el.offsetWidth;
      el.classList.add("shuffling");
    });
  }

  function maybeFlashSpecial(snap) {
    if (snap.phase !== "reveal") return;
    const holder = snap.players.find((p) => p.staging);
    if (!holder || !holder.staging) return;
    const card = holder.staging;
    if (card.type !== "action" && card.type !== "modifier") return;
    const key = `${snap.round}:${holder.id}:${card.id}`;
    if (state.lastFx === key) return;
    state.lastFx = key;
    flashSpecial(holder, card);
  }

  function flashSpecial(player, card) {
    const fx = $("fx");
    if (!fx) return;
    const kind = card.kind || card.type;
    fx.className = "show kind-" + kind;
    $("fx-name").textContent = RiskSeven.cards.cardLabel(card);
    $("fx-who").textContent = player.name;
    fx.querySelectorAll(".spark").forEach((s) => s.remove());
    for (let i = 0; i < 18; i++) {
      const spark = document.createElement("div");
      spark.className = "spark";
      const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const dist = 80 + Math.random() * 160;
      spark.style.left = "50%";
      spark.style.top = "42%";
      spark.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      spark.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      spark.style.background = kind === "freeze" ? "#bfefff" : kind === "draw3" ? "#ffc19a" : kind === "secondChance" ? "#b6ffd4" : "#ffe7a3";
      fx.appendChild(spark);
    }
    RiskSeven.sfx.special(kind);
    const el = document.querySelector(`.card[data-id="${CSS.escape(card.id)}"]`);
    if (el) {
      el.classList.remove("burst");
      void el.offsetWidth;
      el.classList.add("burst");
    }
    clearTimeout(fx._t);
    holdFx(1000);
    fx._t = setTimeout(() => {
      fx.className = "";
      fx.querySelectorAll(".spark").forEach((s) => s.remove());
    }, 950);
  }

  function maybeFlashSeven(prev, snap) {
    snap.players.forEach((p) => {
      const before = prev && prev.players.find((x) => x.id === p.id);
      if (p.hasSeven && (!before || !before.hasSeven)) flashSeven(p);
    });
  }

  function flashSeven(player) {
    const fx = $("fx");
    if (!fx) return;
    const key = `seven:${state.snap.round}:${player.id}`;
    if (state.lastFx === key) return;
    state.lastFx = key;
    fx.className = "show kind-seven";
    $("fx-name").textContent = "SEVEN";
    $("fx-who").textContent = `${player.name}  ·  +15`;
    fx.querySelectorAll(".spark, .confetti").forEach((s) => s.remove());
    for (let i = 0; i < 48; i++) {
      const spark = document.createElement("div");
      spark.className = "spark";
      const ang = (Math.PI * 2 * i) / 48 + Math.random() * 0.2;
      const dist = 90 + Math.random() * 240;
      spark.style.left = "50%";
      spark.style.top = "40%";
      spark.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      spark.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      spark.style.background = i % 3 === 0 ? "#fff4c8" : i % 3 === 1 ? "#e4c36a" : "#ffe28a";
      spark.style.width = 6 + Math.random() * 8 + "px";
      spark.style.height = spark.style.width;
      fx.appendChild(spark);
    }
    for (let i = 0; i < 28; i++) {
      const bit = document.createElement("div");
      bit.className = "confetti";
      bit.style.left = 8 + Math.random() * 84 + "%";
      bit.style.animationDelay = Math.random() * 0.35 + "s";
      bit.style.background = ["#e4c36a", "#f3df9a", "#fff", "#ff8a4a", "#3dd68c"][i % 5];
      fx.appendChild(bit);
    }
    RiskSeven.sfx.seven();
    const seat = document.querySelector(`[data-seat="${player.id}"]`);
    if (seat) {
      seat.classList.remove("seven-flash");
      void seat.offsetWidth;
      seat.classList.add("seven-flash");
    }
    holdFx(2900);
    clearTimeout(fx._t);
    fx._t = setTimeout(() => {
      fx.className = "";
      fx.querySelectorAll(".spark, .confetti").forEach((s) => s.remove());
    }, 2800);
  }

  function maybeFlashSave(prev, snap) {
    if (!prev) return;
    snap.players.forEach((p) => {
      const before = prev.players.find((x) => x.id === p.id);
      if (before && before.secondChance && !p.secondChance && p.status === "active" && !p.hasSeven) {
        flashSave(p);
      }
    });
  }

  function flashSave(player) {
    const fx = $("fx");
    if (!fx) return;
    const key = `save:${state.snap.round}:${player.id}:${state.snap.log.length}`;
    if (state.lastFx === key) return;
    state.lastFx = key;
    fx.className = "show kind-secondChance kind-save";
    $("fx-name").textContent = "SAVED";
    $("fx-who").textContent = `${player.name} · Spare`;
    fx.querySelectorAll(".spark, .confetti").forEach((s) => s.remove());
    for (let i = 0; i < 24; i++) {
      const spark = document.createElement("div");
      spark.className = "spark";
      const ang = (Math.PI * 2 * i) / 24 + Math.random() * 0.2;
      const dist = 70 + Math.random() * 160;
      spark.style.left = "50%";
      spark.style.top = "42%";
      spark.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      spark.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      spark.style.background = i % 2 ? "#b6ffd4" : "#3dd68c";
      fx.appendChild(spark);
    }
    RiskSeven.sfx.save();
    const seat = document.querySelector(`[data-seat="${player.id}"]`);
    if (seat) {
      seat.classList.remove("save-flash");
      void seat.offsetWidth;
      seat.classList.add("save-flash");
      clearTimeout(seat._saveT);
      seat._saveT = setTimeout(() => seat.classList.remove("save-flash"), 1100);
    }
    holdFx(1150);
    clearTimeout(fx._t);
    fx._t = setTimeout(() => {
      fx.className = "";
      fx.querySelectorAll(".spark, .confetti").forEach((s) => s.remove());
    }, 1100);
  }

  function maybeFlashBust(prev, snap) {
    if (!prev) return;
    snap.players.forEach((p) => {
      const before = prev.players.find((x) => x.id === p.id);
      if (before && before.status !== "busted" && p.status === "busted") {
        flashBust(p);
      }
    });
  }

  function flashBust(player) {
    const fx = $("fx");
    if (!fx) return;
    const key = `bust:${state.snap.round}:${player.id}`;
    if (state.lastFx === key) return;
    state.lastFx = key;
    fx.className = "show kind-bust";
    $("fx-name").textContent = "BUST";
    $("fx-who").textContent = player.name;
    fx.querySelectorAll(".spark").forEach((s) => s.remove());
    for (let i = 0; i < 22; i++) {
      const spark = document.createElement("div");
      spark.className = "spark";
      const ang = (Math.PI * 2 * i) / 22 + Math.random() * 0.25;
      const dist = 70 + Math.random() * 180;
      spark.style.left = "50%";
      spark.style.top = "42%";
      spark.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      spark.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      spark.style.background = i % 2 ? "#ff8e82" : "#ffd0c8";
      fx.appendChild(spark);
    }
    RiskSeven.sfx.bust();
    const seat = document.querySelector(`[data-seat="${player.id}"]`);
    if (seat) {
      seat.classList.remove("busted-flash");
      void seat.offsetWidth;
      seat.classList.add("busted-flash");
    }
    holdFx(1150);
    clearTimeout(fx._t);
    fx._t = setTimeout(() => {
      fx.className = "";
      fx.querySelectorAll(".spark").forEach((s) => s.remove());
    }, 1100);
  }

  function playersAround(players, myId) {
    const list = players.slice();
    const i = list.findIndex((p) => p.id === myId);
    if (i < 0) return { me: null, others: list };
    return {
      me: list[i],
      others: list.slice(i + 1).concat(list.slice(0, i)),
    };
  }

  function seatClass(nOthers, index) {
    if (nOthers === 1) return "top";
    if (nOthers === 2) return index === 0 ? "top-left" : "top-right";
    if (nOthers === 3) return ["top-left", "top", "top-right"][index];
    if (nOthers === 4) return ["top-left", "top-right", "mid-left", "mid-right"][index];
    if (nOthers === 5) return ["top-left", "top", "top-right", "mid-left", "mid-right"][index];
    return ["top-left", "top", "top-right", "mid-left", "mid-right", "low-left"][index] || "top";
  }

  function humanAssigning(snap) {
    if (!snap.prompt || snap.prompt.kind !== "target") return false;
    const actor = snap.players.find((p) => p.id === snap.prompt.playerId);
    return !!(actor && actor.id === state.myId && state.waiter && state.waiter.kind === "target");
  }

  function renderTable(snap) {
    $("round-label").textContent = `Round ${snap.round}`;
    const felt = document.querySelector(".felt");
    if (felt) felt.dataset.n = String(snap.players.length);

    $("deck-count").textContent = `${snap.deckCount} left`;
    $("discard-count").textContent = `${snap.discardCount} discard`;

    const seats = $("seats");
    const around = playersAround(snap.players, state.myId);
    const me = around.me;
    const others = around.others;
    const ordered = me ? others.concat([me]) : others;
    const assigning = humanAssigning(snap);
    const assignCard = assigning ? snap.prompt.card : null;

    ordered.forEach((p) => {
      let seat = seats.querySelector(`[data-seat="${p.id}"]`);
      if (!seat) {
        seat = document.createElement("div");
        seat.dataset.seat = p.id;
        seat.innerHTML = `
          <div class="who">
            <div class="bubble"></div>
            <img alt="">
            <div class="meta">
              <div class="name"></div>
              <div class="role"></div>
              <div class="pts"></div>
            </div>
            <div class="badge"></div>
          </div>
          <div class="extras"></div>
          <div class="numbers"></div>
          <div class="round-pts"></div>
        `;
        seats.appendChild(seat);
      }
      const pos = me && p.id === me.id ? "you" : seatClass(others.length, others.indexOf(p));
      seat.className = "seat " + pos;
      const isTurn = snap.prompt && snap.prompt.kind === "hitStay" && snap.prompt.playerId === p.id;
      const canTarget = assigning && snap.prompt.candidateIds.includes(p.id);
      seat.classList.toggle("turn", !!isTurn);
      seat.classList.toggle("targetable", !!canTarget);
      seat.querySelector("img").src = p.portrait;
      seat.querySelector(".name").textContent = p.name;
      const role = seat.querySelector(".role");
      if (role) {
        role.textContent = p.id === state.myId ? "" : p.title || "";
      }
      seat.querySelector(".pts").textContent = `${p.totalScore} pts`;
      const badge = seat.querySelector(".badge");
      badge.textContent = statusText(p, isTurn);
      badge.className = "badge " + statusClass(p, isTurn);

      const extras = seat.querySelector(".extras");
      const extraCards = p.modifiers.concat(p.pendingActions || []).concat(p.received || []);
      if (p.staging && p.staging.type !== "number" && !extraCards.some((c) => c.id === p.staging.id)) {
        extraCards.push(p.staging);
      }
      if (p.secondChance && !extraCards.some((c) => c.kind === "secondChance")) {
        extraCards.push({ id: `held-sc-${p.id}`, type: "action", kind: "secondChance" });
      }
      const silentIds = new Set((p.received || []).map((c) => c.id));
      syncCards(extras, extraCards, false, assignCard, { silentIds });

      const nums = seat.querySelector(".numbers");
      const shown = p.numbers.slice();
      if (p.staging && p.staging.type === "number" && !shown.some((c) => c.id === p.staging.id)) {
        shown.push(p.staging);
      }
      syncCards(nums, shown, p.status === "busted", null);

      const rp = seat.querySelector(".round-pts");
      if (p.status === "busted") rp.innerHTML = `<b>0</b> busted`;
      else rp.innerHTML = `<b>${p.roundScore}</b> this round`;

      const onPick = () => {
        if (canTarget) pickTarget(p.id);
      };
      seat.onclick = onPick;
      seat.querySelector(".who").onclick = (e) => {
        e.stopPropagation();
        onPick();
      };
    });

    const live = new Set(snap.players.map((p) => p.id));
    [...seats.querySelectorAll(".seat")].forEach((el) => {
      if (!live.has(el.dataset.seat)) el.remove();
    });

    const banner = $("banner");
    if (assigning) {
      banner.hidden = true;
    } else if (snap.prompt && snap.prompt.kind === "target") {
      const actor = snap.players.find((p) => p.id === snap.prompt.playerId);
      banner.hidden = false;
      banner.textContent = `${actor.name} is assigning ${RiskSeven.cards.cardLabel(snap.prompt.card)}…`;
    } else if (snap.prompt && snap.prompt.kind === "hitStay" && snap.prompt.playerId !== state.myId) {
      const actor = snap.players.find((p) => p.id === snap.prompt.playerId);
      banner.hidden = false;
      banner.textContent = `${actor.name} is deciding…`;
    } else {
      banner.hidden = true;
    }

  }

  function statusText(p, isTurn) {
    if (p.hasSeven) return "Seven";
    if (p.status === "busted") return "Bust";
    if (p.status === "stayed") return "Stay";
    if (p.status === "frozen") return "Frozen";
    if (isTurn) return "Turn";
    return "In";
  }

  function statusClass(p, isTurn) {
    if (p.hasSeven) return "seven";
    if (p.status === "busted") return "bust";
    if (p.status === "stayed") return "stay";
    if (p.status === "frozen") return "frozen";
    if (isTurn) return "active";
    return "";
  }

  function syncCards(container, cards, busted, assignCard, opts) {
    const silentIds = (opts && opts.silentIds) || new Set();
    const have = new Set(cards.map((c) => c.id));
    cards.forEach((c) => {
      if (c.kind !== "secondChance") return;
      if (container.querySelector(`.card[data-id="${CSS.escape(c.id)}"]`)) return;
      const leftover = [...container.querySelectorAll(".card.secondChance")].find((e) => !have.has(e.dataset.id));
      if (leftover) leftover.dataset.id = c.id;
    });
    [...container.querySelectorAll(".card")].forEach((el) => {
      if (!have.has(el.dataset.id)) el.remove();
    });
    let fresh = 0;
    cards.forEach((c) => {
      let el = container.querySelector(`.card[data-id="${CSS.escape(c.id)}"]`);
      if (!el) {
        const quiet = silentIds.has(c.id);
        el = cardEl(c, quiet, busted);
        container.appendChild(el);
        const delay = fresh * 50;
        fresh += 1;
        requestAnimationFrame(() => {
          setTimeout(() => {
            el.classList.add("face-up");
            if (!quiet) RiskSeven.sfx.deal();
          }, delay);
        });
      }
      el.classList.toggle("bust-mark", !!busted);
      const canGive = !!(assignCard && (c.id === assignCard.id || (c.kind && c.kind === assignCard.kind && RiskSeven.cards.isAssignable(c))));
      el.classList.toggle("assignable", canGive);
      el.style.transform = "";
      el.onclick = canGive
        ? (e) => {
            e.stopPropagation();
            document.querySelectorAll(".seat.targetable").forEach((s) => {
              s.classList.remove("nudge");
              void s.offsetWidth;
              s.classList.add("nudge");
            });
          }
        : null;
    });
  }

  function cardEl(card, faceUp, busted) {
    const el = document.createElement("div");
    el.className = `card ${card.type} ${card.kind || ""} ${card.type === "number" ? "v-" + card.value : ""}`;
    el.dataset.id = card.id;
    if (faceUp) el.classList.add("face-up");
    if (busted) el.classList.add("bust-mark");
    el.innerHTML = `<div class="card-inner"><div class="card-back">${cardBackInner()}</div><div class="card-face">${faceInner(card)}</div></div>`;
    return el;
  }

  function cardBackInner() {
    return `<span class="back-word">Risk</span><span class="back-seven">7</span><span class="back-word">Seven</span>`;
  }

  function faceInner(card) {
    if (card.type === "number") {
      return `<span class="pip">${card.value}</span><span class="big">${card.value}</span><span class="pip bl">${card.value}</span>`;
    }
    if (card.kind === "plus") {
      return `<span class="big">+${card.plus}</span>`;
    }
    if (card.kind === "double") {
      return `<span class="big">×2</span>`;
    }
    if (card.kind === "freeze") {
      return `<span class="card-ico">❄</span><span class="card-name">Lock</span>`;
    }
    if (card.kind === "draw3") {
      return `<span class="card-ico">3</span><span class="card-name">Triple</span>`;
    }
    if (card.kind === "secondChance") {
      return `<span class="card-ico">♣</span><span class="card-name">Spare</span>`;
    }
    return "";
  }

  function updateActions() {
    const snap = state.snap;
    const myTurn =
      snap &&
      snap.prompt &&
      snap.prompt.kind === "hitStay" &&
      snap.prompt.playerId === state.myId &&
      state.onlineRole !== "spectate";
    $("hit").disabled = !myTurn;
    $("stay").disabled = !myTurn;
    $("dock").style.visibility = myTurn ? "visible" : "hidden";
  }

  function paintLog(snap) {
    const box = $("log");
    box.innerHTML = snap.log
      .slice()
      .reverse()
      .map((l) => `<div class="${l.kind}">${esc(forMe(l.text))}</div>`)
      .join("");
  }

  async function autoContinue(ms) {
    let timer = 0;
    const auto = new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    await Promise.race([auto, wait("continue")]);
    clearTimeout(timer);
    if (state.waiter && state.waiter.kind === "continue") finishWait(true);
  }

  function showRoundEnd() {
    const snap = state.snap;
    if (!snap || !snap.roundResults) return;
    $("round-title").textContent = `Round ${snap.round} scored`;
    const box = $("round-results");
    box.innerHTML = "";
    snap.roundResults
      .slice()
      .sort((a, b) => b.totalScore - a.totalScore)
      .forEach((r) => {
        const col = document.createElement("div");
        col.className = "result-col" + (r.id === state.myId ? " you" : "");
        const detail =
          r.pts === 0 && r.status === "busted"
            ? "busted"
            : `+${r.pts}${r.hasSeven ? " · seven" : r.status === "frozen" ? " · frozen" : ""}`;
        col.innerHTML = `<img src="${r.portrait}" alt=""><div class="rc-name">${esc(r.name)}</div><div class="rc-round ${r.pts === 0 && r.status === "busted" ? "zero" : ""}">${detail}</div><b class="rc-total">${r.totalScore}</b>`;
        box.appendChild(col);
      });
    $("round-end").classList.add("show");
  }

  function showWinner() {
    const w =
      (state.game && state.game.winners && state.game.winners[0]) ||
      (state.snap && state.snap.winners && state.snap.winners[0]);
    if (!w) return;
    $("win-pic").src = w.portrait;
    $("win-title").textContent = `${w.name} ${w.id === state.myId ? "win" : "wins"}`;
    $("win-sub").textContent = `${w.totalScore} points · ${state.snap ? state.snap.round : ""} rounds`;
    $("winner").classList.add("show");
    RiskSeven.sfx.win();
    if (w.id === state.myId) launchFireworks();
  }

  function launchFireworks() {
    const host = $("win-fx");
    if (!host) return;
    host.innerHTML = "";
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      if (n > 14) {
        clearInterval(timer);
        return;
      }
      spawnBurst(host);
      RiskSeven.sfx.firework();
    }, 280);
    spawnBurst(host);
  }

  function spawnBurst(host) {
    const x = 12 + Math.random() * 76;
    const y = 18 + Math.random() * 50;
    for (let i = 0; i < 22; i++) {
      const bit = document.createElement("div");
      bit.className = "fw-bit";
      const ang = (Math.PI * 2 * i) / 22;
      const dist = 40 + Math.random() * 90;
      bit.style.left = x + "%";
      bit.style.top = y + "%";
      bit.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      bit.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      bit.style.background = ["#e4c36a", "#fff4c8", "#ff8a4a", "#3dd68c", "#8fd6ef", "#fff"][i % 6];
      host.appendChild(bit);
      setTimeout(() => bit.remove(), 1200);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  window.addEventListener("DOMContentLoaded", setupMenu);
})();
