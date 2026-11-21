/* CivicLens — helpers shared by the citizen portal (citizen.js) and the officer portal (officer.js). */
(function () {
  const C = window.CL_CONFIG;
  const URL_ = (window.CL_BACKEND_URL || "").trim();
  const HAS_SERVER = /^https?:\/\//.test(URL_);

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const load = (k, d, store = localStorage) => { try { return JSON.parse(store.getItem(k)) ?? d; } catch (_) { return d; } };
  const save = (k, v, store = localStorage) => { try { store.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("Storage full", e); } };

  async function api(action, payload = {}, timeoutMs = 45000) {
    if (!HAS_SERVER) throw new Error("Server not configured");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // text/plain body = "simple" request, so Apps Script needs no CORS preflight.
      const res = await fetch(URL_, { method: "POST", body: JSON.stringify({ action, ...payload }), signal: ctrl.signal });
      const j = await res.json();
      if (!j.ok) { const e = new Error(j.error || "Server error"); e.server = true; throw e; }
      return j;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Server took too long to answer");
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function checkServer() {
    const pill = $("#enginePill");
    if (!pill) return;
    if (!HAS_SERVER) { pill.textContent = "Offline mode"; pill.title = "No server configured — using on-device rules"; return false; }
    try {
      const r = await api("ping", {}, 20000);
      pill.textContent = r.ai ? "AI online" : "Server online · AI key missing";
      pill.classList.toggle("is-ai", !!r.ai);
      if (r.city && $("#cityLabel")) $("#cityLabel").textContent = r.city;
      return true;
    } catch (e) {
      pill.textContent = "Offline mode";
      pill.title = `Server unreachable (${e.message})`;
      return false;
    }
  }

  function resizeImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", quality));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  const statusClass = s => `st-${String(s).replace(/\s+/g, "").toLowerCase()}`;
  const normStatus = s => C.LEGACY_STATUS[s] || s;

  window.CL_UI = {
    HAS_SERVER, $, esc, sleep, load, save, api, checkServer, resizeImage, statusClass, normStatus,
    sevClass: s => `sev-${String(s).toLowerCase()}`,
    deptName: d => C.DEPARTMENTS[d]?.name || d,
    deptShort: d => (d === "ALL" ? "All departments" : C.DEPARTMENTS[d]?.short || d),
    catLabel: c => C.CATEGORIES[c]?.label || c,
    fmtDate: t => new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  };
})();
