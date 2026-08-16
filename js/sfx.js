/* Event sounds. Backed by RiskSeven.audio so Safari can play them. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});
  const noop = function () {};

  function A() {
    return RiskSeven.audio;
  }

  RiskSeven.sfx = {
    setEnabled: function (enabled) {
      if (A()) A().setSfx(enabled);
    },
    enabled: function () {
      return A() ? A().sfxOn() : true;
    },
    primed: function () {
      return A() ? A().ready() : false;
    },
    unlock: function () {
      if (A()) A().unlock();
    },
    deal: function () {
      if (A()) A().deal();
    },
    stay: noop,
    bust: function () {
      if (A()) A().play("bust", 0.58);
    },
    freeze: function () {
      if (A()) A().play("freeze", 0.55);
    },
    seven: function () {
      if (A()) A().play("seven", 0.78);
    },
    newRound: noop,
    talk: noop,
    save: function () {
      if (A()) A().play("save", 0.7);
    },
    win: noop,
    firework: noop,
    shuffle: noop,
    click: function () {
      if (A()) A().play("click", 0.42);
    },
    yourTurn: noop,
    special: function (kind) {
      if (!A()) return;
      if (kind === "secondChance" || kind === "plus" || kind === "double") A().play("cheer", 0.6);
      if (kind === "draw3") A().play("triple", 0.62);
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
