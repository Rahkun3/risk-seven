/* Talks to the Risk Seven table server. */
(function (root) {
  const RiskSeven = (root.RiskSeven = root.RiskSeven || {});
  let ws = null;
  let connectPromise = null;
  let reconnectTimer = null;
  let failCount = 0;
  let wantOpen = false;
  const handlers = {};

  function emit(type, payload) {
    (handlers[type] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function sessionId() {
    try {
      let id = localStorage.getItem("rs-session");
      if (!id) {
        id =
          (root.crypto && crypto.randomUUID && crypto.randomUUID()) ||
          "s" + String(Math.random()).slice(2) + Date.now();
        localStorage.setItem("rs-session", id);
      }
      return id;
    } catch (e) {
      return "s" + Date.now();
    }
  }

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function socketUrl() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return proto + "//" + location.host;
  }

  function scheduleReconnect() {
    if (!wantOpen || reconnectTimer) return;
    const wait = Math.min(8000, 600 * Math.pow(2, failCount));
    failCount += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch(() => {});
    }, wait);
  }

  function connect() {
    wantOpen = true;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return connectPromise || Promise.resolve();
    if (connectPromise) return connectPromise;
    connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      const sock = new WebSocket(socketUrl());
      sock.onopen = () => {
        ws = sock;
        failCount = 0;
        connectPromise = null;
        settled = true;
        emit("open", {});
        resolve();
      };
      sock.onerror = () => {
        if (!settled) {
          settled = true;
          connectPromise = null;
          reject(new Error("Could not reach the table server."));
        }
      };
      sock.onclose = () => {
        if (ws === sock) ws = null;
        connectPromise = null;
        emit("disconnected", {});
        if (!settled) {
          settled = true;
          reject(new Error("Could not reach the table server."));
        }
        if (failCount >= 8) {
          wantOpen = false;
          emit("closed", {});
          return;
        }
        scheduleReconnect();
      };
      sock.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (msg && msg.type) emit(msg.type, msg);
      };
    });
    return connectPromise;
  }

  function on(type, fn) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(fn);
  }

  RiskSeven.net = {
    connect,
    send,
    on,
    sessionId,
    connected: function () {
      return !!(ws && ws.readyState === 1);
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
