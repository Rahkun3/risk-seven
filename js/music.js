/* Table music. Backed by RiskSeven.audio so Safari can play it. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});

  function A() {
    return RiskSeven.audio;
  }

  RiskSeven.music = {
    enabled: function () {
      return A() ? A().musicUiOn() : false;
    },
    uiOn: function () {
      return A() ? A().musicUiOn() : false;
    },
    blocked: function () {
      return A() ? !A().ready() : true;
    },
    setEnabled: function (on) {
      if (A()) A().setMusic(on);
    },
    enterTable: function () {
      if (A()) A().enterTable();
    },
    leaveTable: function () {
      if (A()) A().leaveTable();
    },
    unlock: function () {
      if (A()) A().unlock();
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
