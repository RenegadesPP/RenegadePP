/* CivicLens — officer portal (officer.html). Login, priority dashboard, duplicate groups, status updates.
 * Only an officer's explicit status change can mark a ticket Resolved.
 */
(function () {
  const C = window.CL_CONFIG, P = window.CL_PIPE, U = window.CL_UI;
  const { $, esc, sleep, load, save, api, sevClass, deptName, deptShort, catLabel } = U;
  const SESSION = "cl.session";
  let session = load(SESSION, null, sessionStorage);   // { token, name, dept }
  let boardTickets = [];
  let busy = false;

  function showView() {
    $("#view-login").hidden = !!session;
    $("#view-dashboard").hidden = !session;
    $("#officerBox").hidden = !session;
    if (session) { $("#officerName").textContent = `${session.name}`; loadBoard(); }
    else setTimeout(() => $("#loginUser").focus(), 50);
  }

  // ---------- login ----------
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#loginBtn");
    $("#loginError").textContent = "";
    if (!U.HAS_SERVER) { $("#loginError").textContent = "The server isn't connected, so officer login is unavailable."; return; }
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      const r = await api("login", { username: $("#loginUser").value, password: $("#loginPass").value }, 20000);
      session = { token: r.token, name: r.name, dept: r.dept };
      save(SESSION, session, sessionStorage);
      $("#loginPass").value = "";
      showView();
    } catch (err) { $("#loginError").textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = "Log in"; }
  });
  function logout(msg) {
    if (session && U.HAS_SERVER) api("logout", { token: session.token }).catch(() => {});
    session = null; sessionStorage.removeItem(SESSION); boardTickets = [];
    showView();
    if (msg) $("#loginError").textContent = msg;
  }
  $("#logoutBtn").addEventListener("click", () => logout());

  // ---------- dashboard ----------
  $("#fDept").innerHTML += Object.entries(C.DEPARTMENTS).map(([k, v]) => `<option value="${k}">${esc(v.short)}</option>`).join("");
  $("#fSev").innerHTML += C.SEVERITIES.slice().reverse().map(s => `<option>${s}</option>`).join("");
  $("#fStatus").innerHTML = `<option value="active">All active (not resolved)</option><option value="">All statuses</option>` +
    C.STATUSES.map(s => `<option>${s}</option>`).join("");
  ["#fDept", "#fSev", "#fStatus"].forEach(s => $(s).addEventListener("change", renderBoard));
  $("#fSearch").addEventListener("input", renderBoard);

  async function loadBoard(quiet) {
    if (!session) return;
    const isAdmin = session.dept === "ALL";
    $("#whoAmI").textContent = `Signed in as ${session.name} — ${deptShort(session.dept)}`;
    document.querySelectorAll(".admin-only").forEach(el => { el.hidden = !isAdmin; });
    $("#fDept").hidden = !isAdmin;
    if (!quiet) $("#syncNote").textContent = "Loading…";
    try {
      const r = await api("list", { token: session.token }, 30000);
      boardTickets = r.tickets.map(t => ({ ...t, status: U.normStatus(t.status) }));
      if (r.city) $("#cityLabel").textContent = r.city;
      $("#syncNote").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      renderBoard();
    } catch (e) {
      if (/SESSION_EXPIRED/.test(e.message)) return logout("Your session ended. Please log in again.");
      $("#syncNote").textContent = `Couldn't refresh: ${e.message}`;
    }
  }
  $("#refreshBtn").addEventListener("click", () => loadBoard());

  function filtered() {
    const d = $("#fDept").value, s = $("#fSev").value, st = $("#fStatus").value, q = $("#fSearch").value.toLowerCase();
    return boardTickets.filter(t =>
      (!d || t.department === d) && (!s || t.severity === s) &&
      (!st || (st === "active" ? t.status !== "Resolved" : t.status === st)) &&
      (!q || `${t.id} ${t.summary} ${t.location} ${(t.reports || []).map(r => r.text).join(" ")}`.toLowerCase().includes(q)));
  }

  function fmtLeft(h) {
    if (h <= 0) { const o = -h; return o < 1 ? `${Math.round(o * 60)} min overdue` : `${Math.round(o)} h overdue`; }
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${Math.round(h)} h`;
    return `${Math.round(h / 24)} days`;
  }

  function renderKpis() {
    const now = Date.now();
    const open = boardTickets.filter(t => t.status !== "Resolved");
    const by = s => open.filter(t => t.severity === s).length;
    const breached = open.filter(t => P.slaInfo(t, now).breached).length;
    const groups = boardTickets.filter(t => t.reports.length > 1).length;
    $("#kpis").innerHTML = [
      ["Critical open", by("Critical"), "sev-critical"],
      ["High open", by("High"), "sev-high"],
      ["Medium + low open", by("Medium") + by("Low"), ""],
      ["Past internal deadline", breached, breached ? "alert" : ""],
      ["Duplicate groups", groups, ""],
    ].map(([l, v, c]) => `<div class="kpi ${c}"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join("");
  }

  const statusSelect = t => `<select class="status" data-id="${t.id}" aria-label="Status of ${t.id}">
    ${C.STATUSES.map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select>`;

  function renderBoard() {
    renderKpis();
    const now = Date.now();
    const rows = filtered().map(t => ({ t, score: P.priorityScore(t, now) })).sort((a, b) => b.score - a.score);
    $("#boardEmpty").hidden = rows.length > 0;
    $("#boardEmpty").innerHTML = session && session.dept === "ALL"
      ? "<p>No tickets yet. File a complaint from the citizen portal, or press <strong>Load demo complaints</strong>.</p>"
      : "<p>No tickets for your department right now.</p>";
    $("#ticketRows").innerHTML = rows.map(({ t, score }, i) => {
      const sla = P.slaInfo(t, now);
      return `<tr class="${sevClass(t.severity)} ${t.status === "Resolved" ? "is-done" : ""}" data-id="${t.id}" tabindex="0">
        <td class="rank"><span>${t.status === "Resolved" ? "–" : i + 1}</span><small title="Priority score">${score < 0 ? "" : score}</small></td>
        <td><span class="sev-tag ${sevClass(t.severity)}">${t.severity}</span></td>
        <td class="tid">${t.id}${t.photo ? ' <span class="has-photo" title="Has photo">◩</span>' : ""}</td>
        <td class="issue"><div class="issue-title">${esc(t.summary)}</div>
          <div class="issue-meta">${esc(catLabel(t.category))}${t.location ? ` — ${esc(t.location)}` : ""}${t.language && t.language !== "English" ? ` <span class="lang">${esc(t.language)}</span>` : ""}</div>
          <div class="issue-reason">${esc(t.severityReason)}</div></td>
        <td>${esc(deptShort(t.department))}</td>
        <td class="num">${t.reports.length > 1 ? `<strong title="Duplicate group">${t.reports.length}</strong>` : "1"}</td>
        <td class="${sla.breached ? "overdue" : ""}">${t.status === "Resolved" ? "Done" : fmtLeft(sla.hoursLeft)}</td>
        <td>${statusSelect(t)}</td></tr>`;
    }).join("");
  }

  async function changeStatus(sel) {
    const id = sel.dataset.id, status = sel.value;
    const t = boardTickets.find(x => x.id === id);
    if (status === "Resolved" && !confirm(`Mark ${id} as Resolved? Citizens following it will see “Resolved”.`)) { sel.value = t.status; return; }
    sel.disabled = true;
    try {
      const r = await api("update", { token: session.token, id, status }, 20000);
      boardTickets = boardTickets.map(x => (x.id === id ? { ...r.ticket, reports: x.reports, status: U.normStatus(r.ticket.status) } : x));
      renderBoard();
      if ($("#detailDlg").open) openDetail(id);
    } catch (err) {
      if (/SESSION_EXPIRED/.test(err.message)) return logout("Your session ended. Please log in again.");
      alert(`Couldn't update ${id}: ${err.message}`); loadBoard();
    }
  }
  $("#ticketRows").addEventListener("change", e => { if (e.target.matches("select.status")) changeStatus(e.target); });
  $("#detailBody").addEventListener("change", e => { if (e.target.matches("select.status")) changeStatus(e.target); });

  // ---------- detail: full officer view ----------
  function openDetail(id) {
    const t = boardTickets.find(x => x.id === id);
    if (!t) return;
    const sla = P.slaInfo(t, Date.now());
    $("#detailBody").innerHTML = `
    <article class="slip ${sevClass(t.severity)}">
      <div class="slip-band"><span>${t.severity}</span></div>
      <div class="slip-body">
        <div class="slip-top"><span class="ticket-id">${t.id}</span>
          <span class="engine-tag">${t.engine === "offline-rules" ? "Offline rules" : "Gemini AI"}${t.confidence != null ? ` · ${Math.round(t.confidence * 100)}% sure` : ""}</span></div>
        <h2 class="slip-title">${esc(t.summary)}</h2>
        <dl class="facts">
          <div><dt>Category</dt><dd>${esc(catLabel(t.category))}</dd></div>
          <div><dt>Suggested department</dt><dd>${esc(deptName(t.department))}</dd></div>
          <div><dt>Why ${t.severity.toLowerCase()}</dt><dd>${esc(t.severityReason)}</dd></div>
          <div><dt>Location</dt><dd>${esc(t.location || "Not given")}${t.geo ? ` <small>(<a href="https://maps.google.com/?q=${t.geo.lat},${t.geo.lng}" target="_blank" rel="noopener">${t.geo.acc > 500 ? "approx. " : ""}map</a>)</small>` : ""}</dd></div>
          <div><dt>Internal deadline</dt><dd>${t.status === "Resolved" ? "Resolved" : fmtLeft(sla.hoursLeft)}</dd></div>
          <div><dt>Status (citizens see this)</dt><dd>${statusSelect(t)}</dd></div>
        </dl>
        ${(t.hazards || []).length ? `<div class="chips">${t.hazards.map(h => `<span class="chip">${esc(C.HAZARDS[h] || h)}</span>`).join("")}</div>` : ""}
        ${(t.overrides || []).length ? `<p class="guard"><strong>Safety guardrail:</strong> ${t.overrides.map(esc).join("; ")}. ${t.engine === "offline-rules" ? "Initial rating" : "The AI said"} ${esc(t.aiSeverity)}.</p>` : ""}
        ${t.photoObservation ? `<p class="photo-obs"><strong>Photo shows:</strong> ${esc(t.photoObservation)}${t.photoMismatch ? " — <em>doesn't match the text, check before dispatch</em>" : ""}</p>` : ""}
        ${t.missingInfo ? `<p class="ask"><strong>Information still needed:</strong> ${esc(t.missingInfo)}</p>` : ""}
        ${t.ruleCheck && !t.ruleCheck.agrees && t.ruleCheck.category ? `<p class="crosscheck">Rule engine would have chosen <em>${esc(catLabel(t.ruleCheck.category))}</em> — category kept from AI.</p>` : ""}
      </div>
    </article>
    <h3 class="sub">${t.reports.length > 1 ? `Duplicate group — ${t.reports.length} citizen reports` : "Citizen report"}</h3>
    <ul class="reports">${t.reports.map((r, i) => `<li>
      <time>${new Date(r.at).toLocaleString()}</time> <span class="lang">${esc(r.language || "")}</span>
      ${r.citizen ? `<span class="hint">· ${esc(r.citizen.name)}, ${esc(r.citizen.phone)}</span>` : `<span class="hint">· ${i === 0 && !r.citizen ? "no contact given" : ""}</span>`}
      ${r.address ? `<span class="hint">· GPS: ${esc(r.address)}</span>` : ""}
      <p>${esc(r.text || "(photo only)")}</p>${r.photo ? `<img class="detail-photo" src="${r.photo}" alt="Photo from report ${i + 1}">` : ""}</li>`).join("")}</ul>
    <p class="hint">Citizen contact details are visible to officers only.</p>
    <h3 class="sub">History</h3>
    <ul class="log">${(t.log || []).map(l => `<li><time>${new Date(l.at).toLocaleString()}</time> ${esc(l.what)}</li>`).join("")}</ul>`;
    if (!$("#detailDlg").open) $("#detailDlg").showModal();
  }
  $("#ticketRows").addEventListener("click", e => {
    if (e.target.closest("select")) return;
    const tr = e.target.closest("tr[data-id]"); if (tr) openDetail(tr.dataset.id);
  });
  $("#ticketRows").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("tr[data-id]")) openDetail(e.target.dataset.id); });

  $("#csvBtn").addEventListener("click", () => {
    const now = Date.now();
    const head = ["priority", "id", "severity", "reason", "category", "department", "summary", "location", "reports", "status", "created", "language", "engine"];
    const rows = boardTickets.map(t => [P.priorityScore(t, now), t.id, t.severity, t.severityReason, t.category, deptName(t.department), t.summary,
      t.location, t.reports.length, t.status, new Date(t.createdAt).toISOString(), t.language, t.engine]).sort((a, b) => b[0] - a[0]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `civiclens-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Delete every ticket for all departments?")) return;
    try { await api("reset", { token: session.token }); loadBoard(); } catch (e) { alert(e.message); }
  });

  $("#batchBtn").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const btn = $("#batchBtn"), list = window.CL_SAMPLES;
    for (let i = 0; i < list.length; i++) {
      btn.textContent = `Filing ${i + 1} of ${list.length}…`;
      try { await api("triage", { text: list[i].text, autoMerge: true }); } catch (e) { console.warn(e); }
      await loadBoard(true);
      await sleep(1000); // stay under free-tier rate limits
    }
    btn.textContent = "Load demo complaints";
    busy = false;
  });

  // ---------- start ----------
  U.checkServer();
  showView();
  setInterval(() => { if (session && !$("#detailDlg").open) loadBoard(true); }, 20000);
})();
