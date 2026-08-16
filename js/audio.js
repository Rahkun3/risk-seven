/* One Web Audio graph for Safari, Chrome, Firefox, and Edge. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});

  const FILES = {
    deal: ["assets/sfx/flip.m4a", "assets/flip.wav"],
    bust: ["assets/sfx/bust.m4a", "assets/bust.wav"],
    freeze: ["assets/sfx/freeze.m4a", "assets/freeze.wav"],
    save: ["assets/sfx/phew.m4a", "assets/phew.wav"],
    cheer: ["assets/sfx/cheer.m4a", "assets/cheer.wav"],
    triple: ["assets/sfx/triple.m4a", "assets/triple.wav"],
    click: ["assets/sfx/click.m4a", "assets/click.wav"],
    seven: ["assets/sfx/seven.m4a", "assets/seven.wav"],
    music: ["assets/sfx/music.m4a", "assets/music.wav"],
  };

  let ctx = null;
  let unlocked = false;
  let buffers = {};
  let raw = {};
  let loadPromise = null;
  let musicNode = null;
  let musicGain = null;
  let inTable = false;
  let musicPref = readMusicPref();
  let sfxOn = readSfxPref();
  let lastDeal = 0;
  const listeners = [];

  function readMusicPref() {
    try {
      const v = localStorage.getItem("riskSeven.music");
      if (v === "on") return true;
    } catch (e) {}
    return false;
  }

  function writeMusicPref(on) {
    try {
      localStorage.setItem("riskSeven.music", on ? "on" : "off");
    } catch (e) {}
  }

  function readSfxPref() {
    try {
      if (localStorage.getItem("riskSeven.sfx") === "off") return false;
    } catch (e) {}
    return true;
  }

  function writeSfxPref(on) {
    try {
      localStorage.setItem("riskSeven.sfx", on ? "on" : "off");
    } catch (e) {}
  }

  function Ctx() {
    return root.AudioContext || root.webkitAudioContext;
  }

  function getCtx() {
    const C = Ctx();
    if (!C) return null;
    if (!ctx) ctx = new C();
    return ctx;
  }

  function decode(c, data) {
    const copy = data.slice(0);
    if (c.decodeAudioData.length === 1) return c.decodeAudioData(copy);
    return new Promise(function (resolve, reject) {
      c.decodeAudioData(copy, resolve, reject);
    });
  }

  async function prefetch() {
    await Promise.all(
      Object.keys(FILES).map(async function (key) {
        if (raw[key]) return;
        for (let i = 0; i < FILES[key].length; i++) {
          try {
            const res = await fetch(FILES[key][i], { cache: "force-cache" });
            if (!res.ok) continue;
            raw[key] = await res.arrayBuffer();
            return;
          } catch (e) {}
        }
      })
    );
  }

  function loadAll() {
    const c = getCtx();
    if (!c) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = prefetch().then(function () {
      return Promise.all(
        Object.keys(FILES).map(function (key) {
          if (buffers[key] || !raw[key]) return Promise.resolve();
          return decode(c, raw[key]).then(function (buf) {
            if (buf) buffers[key] = buf;
          }).catch(function () {});
        })
      );
    });
    return loadPromise;
  }

  prefetch();

  function playBuf(key, vol, rate) {
    const c = getCtx();
    const buf = buffers[key];
    if (!c || !buf || c.state !== "running") return false;
    try {
      const src = c.createBufferSource();
      src.buffer = buf;
      if (rate) src.playbackRate.value = rate;
      const g = c.createGain();
      g.gain.value = vol == null ? 0.5 : vol;
      src.connect(g);
      g.connect(c.destination);
      src.start(0);
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopMusic() {
    if (musicNode) {
      try {
        musicNode.stop();
      } catch (e) {}
      try {
        musicNode.disconnect();
      } catch (e) {}
      musicNode = null;
    }
    if (musicGain) {
      try {
        musicGain.disconnect();
      } catch (e) {}
      musicGain = null;
    }
  }

  function wantMusic() {
    return musicPref === true;
  }

  function startMusic() {
    const c = getCtx();
    const buf = buffers.music;
    if (!c || !buf || !wantMusic() || c.state !== "running") return;
    if (musicNode) return;
    try {
      musicNode = c.createBufferSource();
      musicNode.buffer = buf;
      musicNode.loop = true;
      musicGain = c.createGain();
      musicGain.gain.value = 0.4;
      musicNode.connect(musicGain);
      musicGain.connect(c.destination);
      musicNode.start(0);
      musicNode.onended = function () {
        musicNode = null;
      };
    } catch (e) {}
  }

  function syncMusic() {
    if (wantMusic()) startMusic();
    else stopMusic();
  }

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {}
    });
  }

  async function unlock() {
    const c = getCtx();
    if (!c) return false;
    try {
      if (c.state === "suspended") await c.resume();
    } catch (e) {}
    unlocked = c.state === "running";
    await loadAll();
    if (unlocked) syncMusic();
    emit();
    return unlocked;
  }

  function deal() {
    if (!sfxOn) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastDeal < 28) return;
    lastDeal = now;
    playBuf("deal", 0.52, 0.98 + Math.random() * 0.05);
  }

  RiskSeven.audio = {
    unlock: unlock,
    ready: function () {
      return unlocked;
    },
    onChange: function (fn) {
      listeners.push(fn);
    },
    sfxOn: function () {
      return sfxOn;
    },
    setSfx: function (on) {
      sfxOn = !!on;
      writeSfxPref(sfxOn);
    },
    musicUiOn: function () {
      return musicPref === true;
    },
    setMusic: function (on) {
      musicPref = !!on;
      writeMusicPref(musicPref);
      syncMusic();
      emit();
    },
    enterTable: function () {
      inTable = true;
      syncMusic();
      emit();
    },
    leaveTable: function () {
      inTable = false;
      emit();
    },
    play: function (key, vol, rate) {
      if (!sfxOn) return;
      playBuf(key, vol, rate);
    },
    deal: deal,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
