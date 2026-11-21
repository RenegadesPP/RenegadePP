/* CivicLens — citizen portal (index.html).
 * Citizens never see priority, severity, risk flags or deadlines — only plain status updates.
 */
(function () {
  const C = window.CL_CONFIG, R = window.CL_RULES, P = window.CL_PIPE, U = window.CL_UI;
  const { $, esc, sleep, load, save, api } = U;
  const LS = { citizen: "cl.citizen", local: "cl.localTickets", seq: "cl.localSeq" };

  let citizen = load(LS.citizen, null);   // { token, name, phone }
  let photo = null;                       // { mimeType, base64, thumb }
  let geo = null, geoAddress = "";
  let busy = false;

  // ---------- views ----------
  function showView(name) {
    if (!citizen) name = "signin";
    ["signin", "report", "mine"].forEach(v => { $(`#view-${v}`).hidden = v !== name; });
    document.querySelectorAll(".tab").forEach(b => {
      const on = b.dataset.view === name;
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on);
    });
    $(".tabs").hidden = !citizen;
    $("#citizenBox").hidden = !citizen;
    if (citizen) $("#citizenName").textContent = citizen.name;
    if (name === "mine") renderMine();
    if (name === "signin") setTimeout(() => $("#cName").focus(), 50);
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  // ---------- citizen sign-in ----------
  $("#signinForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("#cName").value.trim(), phone = $("#cPhone").value.trim();
    const btn = $("#signinBtn");
    $("#signinError").textContent = "";
    if (!name) { $("#signinError").textContent = "Please enter your name."; return; }
    if (!/^(\+?91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""))) { $("#signinError").textContent = "Please enter a valid 10-digit mobile number."; return; }
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      let token = null;
      try { token = (await api("citizenLogin", { name, phone }, 20000)).token; }
      catch (err) { if (err.server) throw err; }  // server unreachable → continue on this device
      citizen = { token, name, phone };
      save(LS.citizen, citizen);
      showView("report");
      detectLocation(false);
    } catch (err) {
      $("#signinError").textContent = err.message;
    } finally { btn.disabled = false; btn.textContent = "Continue"; }
  });
  $("#signoutBtn").addEventListener("click", () => {
    citizen = null; localStorage.removeItem(LS.citizen); showView("signin");
  });

  // Calls that need the citizen token; signs in again silently if the 6-hour session ended.
  async function citizenApi(action, payload, timeout) {
    if (citizen && !citizen.token && U.HAS_SERVER) {
      try { citizen.token = (await api("citizenLogin", { name: citizen.name, phone: citizen.phone }, 15000)).token; save(LS.citizen, citizen); } catch (_) {}
    }
    try { return await api(action, { ...payload, citizenToken: citizen && citizen.token }, timeout); }
    catch (e) {
      if (!/CITIZEN_SESSION_EXPIRED/.test(e.message)) throw e;
      citizen.token = (await api("citizenLogin", { name: citizen.name, phone: citizen.phone }, 15000)).token;
      save(LS.citizen, citizen);
      return api(action, { ...payload, citizenToken: citizen.token }, timeout);
    }
  }

  // ---------- complaint form ----------
  // Draft autosave + character counter with a landmark tip
  const DRAFT = "cl.draft";
  const LANDMARK = /\b(near|opp|opposite|beside|behind|front|road|street|cross|main|nagar|layout|colony|school|temple|hospital|bus stop|park|market|circle|junction)\b|నగర్|ರಸ್ತೆ|नगर|गली|தெரு|நகர்/i;
  function updateCount() {
    const v = $("#complaintText").value;
    $("#textCount").textContent = `${v.length} / 3000`;
    const tip = $("#textTip");
    if (!v.trim()) { tip.textContent = "Tip: mention a landmark — shop, school, bus stop"; tip.className = "tip"; }
    else if (!LANDMARK.test(v) && !geo) { tip.textContent = "Add a landmark so the team can find it"; tip.className = "tip"; }
    else { tip.textContent = "Draft saved on this phone"; tip.className = "draft-note"; }
  }
  $("#complaintText").value = localStorage.getItem(DRAFT) || "";
  $("#complaintText").addEventListener("input", () => { localStorage.setItem(DRAFT, $("#complaintText").value); updateCount(); });
  updateCount();

  $("#voiceLang").innerHTML = C.LANGUAGES.map(l => `<option value="${l.code}">${l.label}</option>`).join("");
  $("#samplePicker").innerHTML += window.CL_SAMPLES.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join("");
  $("#samplePicker").addEventListener("change", e => {
    const s = window.CL_SAMPLES[e.target.value];
    if (!s) return;
    $("#complaintText").value = s.text; $("#voiceLang").value = s.lang; e.target.value = ""; updateCount();
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  if (!SR) { $("#micBtn").disabled = true; $("#micBtn").title = "Voice input needs Chrome or Edge"; }
  $("#micBtn").addEventListener("click", () => {
    if (!SR) return;
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = $("#voiceLang").value;
    rec.interimResults = false;
    rec.onresult = e => {
      const said = Array.from(e.results).map(r => r[0].transcript).join(" ");
      const ta = $("#complaintText"); ta.value = (ta.value ? ta.value + " " : "") + said;
      localStorage.setItem(DRAFT, ta.value); updateCount();
    };
    rec.onend = () => { rec = null; $("#micBtn").classList.remove("is-live"); $("#micBtn").lastChild.textContent = "Speak"; };
    rec.onerror = e => { $("#formError").textContent = `Voice input stopped: ${e.error}`; };
    rec.start();
    $("#micBtn").classList.add("is-live"); $("#micBtn").lastChild.textContent = "Listening… tap to stop";
  });

  async function setPhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const big = await U.resizeImage(file, 1024, 0.82);
    const thumb = await U.resizeImage(file, 240, 0.6);
    photo = { mimeType: "image/jpeg", base64: big.split(",")[1], thumb };
    $("#photoPreview").src = thumb; $("#photoPreview").hidden = false;
    $("#photoHint").hidden = true; $("#clearPhoto").hidden = false;
  }
  function clearPhoto() {
    photo = null; $("#photoInput").value = "";
    $("#photoPreview").hidden = true; $("#photoHint").hidden = false; $("#clearPhoto").hidden = true;
  }
  $("#photoInput").addEventListener("change", e => setPhoto(e.target.files[0]));
  $("#clearPhoto").addEventListener("click", clearPhoto);
  const drop = $("#photoDrop");
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("is-over"); setPhoto(e.dataTransfer.files[0]); });

  // ---------- location (automatic) ----------
  const fmtAcc = a => (a >= 1000 ? `${(a / 1000).toFixed(1)} km` : `${a} m`);
  function renderGeo() {
    const st = $("#geoStatus");
    if (!geo) return;
    st.innerHTML = `<strong>${esc(geoAddress || `${geo.lat}, ${geo.lng}`)}</strong><br>
      <small>±${fmtAcc(geo.acc)} · <a href="https://maps.google.com/?q=${geo.lat},${geo.lng}" target="_blank" rel="noopener">view on map</a> ·
      <button type="button" class="btn link" id="geoClear">remove</button></small>` +
      (geo.acc > 500 ? `<br><small class="warn-inline">Approximate (from the network, not GPS). Mention a landmark in your complaint.</small>` : "");
    $("#geoClear").onclick = () => { geo = null; geoAddress = ""; st.textContent = "Location removed."; $("#geoBtn").hidden = false; };
    $("#geoBtn").hidden = true;
  }
  function detectLocation(fromClick) {
    const st = $("#geoStatus");
    if (!navigator.geolocation) { st.textContent = "This browser can't share location. Mention a landmark in your complaint."; return; }
    if (!window.isSecureContext) { st.textContent = "Location needs the https:// link."; return; }
    st.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(async p => {
      geo = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy) };
      geoAddress = ""; renderGeo();
      if (U.HAS_SERVER) { try { geoAddress = (await api("geocode", { lat: geo.lat, lng: geo.lng }, 15000)).address; renderGeo(); } catch (_) {} }
    }, e => {
      st.textContent = {
        1: fromClick ? "Location is blocked. Tap the icon left of the web address → Permissions → Location → Allow, then try again."
                     : "Location not shared. Tap “Use my location” or mention a landmark.",
        2: "Couldn't find your position. Turn on location (GPS) on your phone, then try again.",
        3: "Location took too long. Try again, or mention a landmark.",
      }[e.code] || `Location error: ${e.message}`;
      $("#geoBtn").hidden = false;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 });
  }
  $("#geoBtn").addEventListener("click", () => detectLocation(true));

  // ---------- submit ----------
  function setStep(name) {
    const order = ["read", "classify", "check", "route"];
    const i = order.indexOf(name);
    document.querySelectorAll("#steps li").forEach((li, j) => { li.classList.toggle("done", j < i); li.classList.toggle("active", j === i); });
  }
  function stepsDone() { document.querySelectorAll("#steps li").forEach(li => { li.classList.add("done"); li.classList.remove("active"); }); }

  // On-device fallback when the server can't be reached. Not shared with officers until resent.
  function fileLocally(text, ph, address) {
    const f = P.buildTicketFields(R.offlineTriage(text, !!ph), text, "offline-rules");
    const n = load(LS.seq, 5000) + 1; save(LS.seq, n);
    const id = `CL-L${n}`, now = Date.now();
    const view = { id, status: "Received", statusHelp: "Saved on this phone only — the server couldn't be reached.",
      category: U.catLabel(f.category), department: C.DEPARTMENTS[f.department].short, summary: f.summary,
      location: f.location || (address ? `Near ${address}` : ""), missingInfo: f.missingInfo, createdAt: now, updatedAt: now,
      reports: 1, history: [{ at: now, what: "Received" }], localOnly: true };
    const list = load(LS.local, []); list.unshift(view); save(LS.local, list);
    return { ticket: view, merged: false, reply: f.citizenReplyTemplate.split("{TICKET_ID}").join(id).split("{DEPT}").join(view.department) };
  }

  let lastSubmission = null;
  $("#complaintForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    const text = $("#complaintText").value.trim();
    $("#formError").textContent = "";
    if (!text && !photo) { $("#formError").textContent = "Describe the problem or add a photo to file a complaint."; return; }
    busy = true;
    $("#submitBtn").disabled = true; $("#submitBtn").textContent = "Sending…";
    $("#resultEmpty").hidden = true; $("#ticketOut").innerHTML = ""; $("#steps").hidden = false;
    lastSubmission = { text, photo, geo, address: geoAddress };
    try {
      setStep("read"); await sleep(150); setStep("classify");
      const t2 = setTimeout(() => setStep("check"), 2500);
      let out;
      try {
        out = await citizenApi("triage", { text, geo, address: geoAddress,
          photo: photo ? { mimeType: photo.mimeType, base64: photo.base64 } : null, thumb: photo ? photo.thumb : "" });
      } catch (err) {
        if (err.server) throw err;
        out = fileLocally(text, photo, geoAddress);
      }
      clearTimeout(t2); setStep("route"); await sleep(200); stepsDone(); await sleep(150);
      $("#steps").hidden = true;
      if (out.needsChoice) { renderChoice(out); return; }
      finish(out);
    } catch (err) {
      $("#steps").hidden = true; $("#resultEmpty").hidden = false;
      $("#formError").textContent = `Could not send the complaint: ${err.message}`;
    } finally {
      busy = false; $("#submitBtn").disabled = false; $("#submitBtn").textContent = "Send complaint";
    }
  });

  function finish(out) {
    $("#ticketOut").innerHTML = receipt(out);
    $("#complaintText").value = ""; localStorage.removeItem(DRAFT); updateCount(); clearPhoto(); lastSubmission = null;
    const copyBtn = $("#copyId");
    if (copyBtn) copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(copyBtn.dataset.id); copyBtn.textContent = "Copied ✓"; }
      catch (_) { copyBtn.textContent = copyBtn.dataset.id; }
      setTimeout(() => { copyBtn.textContent = "Copy number"; }, 1800);
    };
    if (window.innerWidth < 900) $("#ticketOut").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- "similar issue already reported" ----------
  function renderChoice(out) {
    const m = out.match;
    $("#ticketOut").innerHTML = `
      <article class="choice">
        <h2>A similar problem has already been reported</h2>
        <div class="match">
          <div class="slip-top"><span class="ticket-id">${esc(m.id)}</span><span class="status-tag ${U.statusClass(m.status)}">${esc(m.status)}</span></div>
          <p class="match-title">${esc(m.summary)}</p>
          <p class="issue-meta">${esc(m.category)}${m.location ? ` · ${esc(m.location)}` : ""}</p>
          <p class="issue-meta">First reported ${U.fmtDate(m.firstReported)} · ${m.reports} report${m.reports > 1 ? "s" : ""} so far</p>
        </div>
        <p>Is this the same problem? Adding your report to it helps the municipal team see how many people are affected. Your name and number are never shown to other citizens.</p>
        <div class="choice-actions">
          <button class="btn primary" data-choice="merge">Add my report to ${esc(m.id)}</button>
          <button class="btn ghost" data-choice="separate">No, it's a different problem — file separately</button>
        </div>
        <p class="form-error" id="choiceError" role="alert"></p>
      </article>`;
    $("#ticketOut").querySelectorAll("[data-choice]").forEach(b => b.addEventListener("click", async () => {
      $("#ticketOut").querySelectorAll("[data-choice]").forEach(x => { x.disabled = true; });
      b.textContent = "Saving…";
      try { finish(await citizenApi("confirm", { pendingId: out.pendingId, choice: b.dataset.choice }, 30000)); }
      catch (err) {
        $("#choiceError").textContent = err.message;
        $("#ticketOut").querySelectorAll("[data-choice]").forEach(x => { x.disabled = false; });
      }
    }));
  }

  // ---------- citizen receipt: status only, no priority ----------
  function receipt({ ticket: t, merged, reply }) {
    return `
    <article class="receipt">
      <div class="slip-top">
        <span class="ticket-id">${esc(t.id)}</span>
        <span class="status-tag ${U.statusClass(t.status)}">${esc(t.status)}</span>
      </div>
      ${merged ? `<p class="merged">Your report was added to complaint ${esc(t.id)}. ${t.reports} people have now reported this problem.</p>` : ""}
      ${t.localOnly ? `<p class="warn">Saved on this phone only — the server couldn't be reached. Please try again when you're online.</p>` : ""}
      <h2 class="slip-title">${esc(t.summary)}</h2>
      <dl class="facts">
        <div><dt>Type of problem</dt><dd>${esc(t.category)}</dd></div>
        <div><dt>Sent to</dt><dd>${esc(t.department)} team</dd></div>
        <div><dt>Location</dt><dd>${esc(t.location || "Not given")}</dd></div>
        <div><dt>Status</dt><dd>${esc(t.status)} — ${esc(t.statusHelp)}</dd></div>
      </dl>
      ${t.missingInfo ? `<p class="ask"><strong>Please also tell us:</strong> ${esc(t.missingInfo)}</p>` : ""}
      <div class="reply"><div class="reply-label">Message for you</div><p>${esc(reply)}</p></div>
      ${t.localOnly ? "" : `<div class="receipt-actions">
        <button type="button" class="btn ghost" id="copyId" data-id="${esc(t.id)}">Copy number</button>
        <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`I reported a civic problem to the municipality: ${t.summary}. Complaint number ${t.id}. Track it here: ${location.origin}${location.pathname}`)}">Share on WhatsApp</a>
      </div>`}
      <p class="hint">Keep your complaint number <strong>${esc(t.id)}</strong>. You'll see every status change under “My complaints”. We can't promise a completion date; the status will change when the team acts on it.</p>
    </article>`;
  }

  // ---------- my complaints + tracking ----------
  function statusCard(t) {
    return `<article class="track-card">
      <div class="slip-top"><span class="ticket-id">${esc(t.id)}</span><span class="status-tag ${U.statusClass(t.status)}">${esc(t.status)}</span></div>
      <h3>${esc(t.summary)}</h3>
      <p class="issue-meta">${esc(t.category)} · ${esc(t.department)} team${t.location ? ` · ${esc(t.location)}` : ""}</p>
      <p class="issue-meta">${esc(t.statusHelp)} ${t.reports > 1 ? `· ${t.reports} people reported this` : ""}</p>
      <ol class="timeline">${C.STATUSES.map(s => {
        const h = (t.history || []).filter(x => x.what === s).pop();
        return `<li class="${h ? "done" : ""} ${s === t.status ? "current" : ""}"><span>${esc(s)}</span>${h ? `<time>${U.fmtDate(h.at)}</time>` : ""}</li>`;
      }).join("")}</ol>
    </article>`;
  }

  async function renderMine() {
    const box = $("#myList");
    const local = load(LS.local, []);
    box.innerHTML = "<p class='hint'>Loading your complaints…</p>";
    let server = [];
    try { server = (await citizenApi("mine", {}, 30000)).tickets; }
    catch (e) { if (!local.length) { box.innerHTML = `<p class="hint">Couldn't load your complaints: ${esc(e.message)}</p>`; return; } }
    const all = [...server, ...local];
    box.innerHTML = all.length ? all.map(statusCard).join("") : "<p class='hint'>You haven't filed any complaints yet.</p>";
  }

  $("#trackForm").addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#trackId").value.trim();
    $("#trackError").textContent = ""; $("#trackOut").innerHTML = "<p class='hint'>Checking…</p>";
    try {
      const t = /^CL-L/i.test(id) ? load(LS.local, []).find(x => x.id === id.toUpperCase()) : (await api("track", { id }, 20000)).ticket;
      if (!t) throw new Error("Not found on this phone");
      $("#trackOut").innerHTML = statusCard(t);
    } catch (err) { $("#trackOut").innerHTML = ""; $("#trackError").textContent = err.message; }
  });

  // ---------- start ----------
  if (citizen) { $("#cName").value = citizen.name; }
  showView("report");
  U.checkServer();
  if (citizen) detectLocation(false);
})();
