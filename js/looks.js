/* Player portrait roster. Shared by the menu, table, and server. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});

  const LOOKS = [
    { id: "f1", src: "assets/look-f1.jpg", label: "Wren", group: "women" },
    { id: "f2", src: "assets/look-f2.jpg", label: "Nia", group: "women" },
    { id: "f3", src: "assets/look-f3.jpg", label: "Zuri", group: "women" },
    { id: "f4", src: "assets/look-f4.jpg", label: "Mei", group: "women" },
    { id: "m1", src: "assets/look-m1.jpg", label: "Arlo", group: "men" },
    { id: "m2", src: "assets/look-m2.jpg", label: "Jae", group: "men" },
    { id: "m3", src: "assets/look-m3.jpg", label: "Otto", group: "men" },
    { id: "m4", src: "assets/look-m4.jpg", label: "Ken", group: "men" },
    { id: "n1", src: "assets/look-n1.jpg", label: "Fox", group: "wild" },
    { id: "n2", src: "assets/look-n2.jpg", label: "Owl", group: "wild" },
    { id: "n3", src: "assets/look-n3.jpg", label: "Leaf", group: "wild" },
    { id: "n4", src: "assets/look-n4.jpg", label: "Sun", group: "wild" },
  ];

  const BY_ID = {};
  LOOKS.forEach((look) => {
    BY_ID[look.id] = look;
  });

  const LEGACY = { female: "f1", male: "m1" };

  function normalize(id) {
    if (!id) return "f1";
    if (LEGACY[id]) return LEGACY[id];
    return BY_ID[id] ? id : "f1";
  }

  function src(id) {
    return BY_ID[normalize(id)].src;
  }

  function look(id) {
    return BY_ID[normalize(id)];
  }

  RiskSeven.looks = { LOOKS, BY_ID, normalize, src, look };

  if (typeof module !== "undefined") module.exports = RiskSeven.looks;
})(typeof globalThis !== "undefined" ? globalThis : this);
