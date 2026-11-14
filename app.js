/* Fangbuch – Oberfläche, Speicher (lokal + Supabase), GPS, Wetter, Karte, Auswertung */
(function () {
  "use strict";
  const F = window.FB;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v, d = 1) => v == null || isNaN(v) ? "–" : Number(v).toFixed(d).replace(".", ",");
  const dDE = iso => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(2, 4) : "–";
  function show(el, text, err) { el.textContent = text; el.classList.remove("hidden"); el.classList.toggle("err", !!err); }

  /* ================= Speicher ================= */
  const TABLES = ["spots", "sessions", "catches"];
  const COLS = {
    spots: ["id", "lat", "lon", "country", "water", "zone", "depth", "struct", "notes"],
    sessions: ["id", "date", "start_time", "end_time", "spots", "country", "live", "attempts", "note", "weather", "extra_misses", "lat", "lon"],
    catches: ["id", "session", "date", "time", "spot", "country", "lat", "lon", "result", "species", "cm", "lure", "size", "color", "weight", "rig", "setup", "retrieve", "tempo", "bite",
      "water_temp", "air_temp", "pressure", "pressure_trend", "humidity", "wind_speed", "wind_dir", "wind_gust", "cloud_cover", "precip", "weather_code", "weather_status", "weather_src",
      "sunset", "light", "moon", "moon_ill", "release", "capture", "notes", "raw"]
  };
  const LS = { data: "fb.data.v1", queue: "fb.queue.v1", synced: "fb.syncedUser" };
  let D = { spots: [], sessions: [], catches: [] }, Q = [];
  let SB = null, USER = null, flushing = false;
  try { const x = JSON.parse(localStorage.getItem(LS.data)); if (x) D = Object.assign(D, x); } catch (e) { }
  try { Q = JSON.parse(localStorage.getItem(LS.queue)) || []; } catch (e) { Q = []; }
  function saveLocal() { try { localStorage.setItem(LS.data, JSON.stringify(D)); localStorage.setItem(LS.queue, JSON.stringify(Q)); } catch (e) { banner("Speicher auf dem Gerät ist voll oder gesperrt.", true); } }
  function clean(t, row) { const o = {}; COLS[t].forEach(k => { if (row[k] !== undefined) o[k] = row[k]; }); return o; }
  function enqueue(t, op, id) { Q = Q.filter(q => !(q.t === t && q.id === id)); Q.push({ t, op, id }); }
  function put(t, row, opts = {}) {
    const i = D[t].findIndex(r => r.id === row.id);
    if (i >= 0) D[t][i] = Object.assign({}, D[t][i], row); else D[t].push(row);
    enqueue(t, "up", row.id); saveLocal(); if (!opts.quiet) render(); flush();
  }
  function del(t, id) { D[t] = D[t].filter(r => r.id !== id); enqueue(t, "del", id); saveLocal(); render(); flush(); }
  async function flush() {
    if (!SB || !USER || !navigator.onLine || flushing) { setSync(); return; }
    flushing = true; setSync();
    while (Q.length) {
      const q = Q[0];
      try {
        if (q.op === "up") {
          const row = D[q.t].find(r => r.id === q.id);
          if (row) { const { error } = await SB.from(q.t).upsert({ ...clean(q.t, row), user_id: USER.id }, { onConflict: "user_id,id" }); if (error) throw error; }
        } else { const { error } = await SB.from(q.t).delete().eq("id", q.id); if (error) throw error; }
        Q.shift(); saveLocal();
      } catch (e) { flushing = false; setSync("Sync-Fehler: " + (e.message || e)); return; }
    }
    flushing = false; setSync();
  }
  async function pull() {
    if (!SB || !USER || !navigator.onLine) return;
    for (const t of TABLES) {
      const { data, error } = await SB.from(t).select("*");
      if (error) { setSync("Laden fehlgeschlagen: " + error.message); return; }
      const pending = new Set(Q.filter(q => q.t === t).map(q => q.id));
      const local = D[t].filter(r => pending.has(r.id));
      const deleted = new Set(Q.filter(q => q.t === t && q.op === "del").map(q => q.id));
      D[t] = data.filter(r => !pending.has(r.id) && !deleted.has(r.id)).map(r => { const o = clean(t, r); return o; }).concat(local);
    }
    saveLocal(); render();
  }
  function setSync(err) {
    const el = $("syncState");
    if (err) { el.textContent = "Sync-Fehler"; el.title = err; return; }
    if (!SB) { el.textContent = "nur lokal"; return; }
    if (!USER) { el.textContent = "nicht angemeldet"; return; }
    if (!navigator.onLine) { el.textContent = Q.length ? `offline · ${Q.length} wartend` : "offline"; return; }
    el.textContent = flushing ? "synchronisiere …" : (Q.length ? `${Q.length} wartend` : "synchron");
  }
  function nextId(t, prefix, width) {
    let mx = 0; D[t].forEach(x => { const m = String(x.id).match(new RegExp("^" + prefix + "(\\d+)$")); if (m) mx = Math.max(mx, +m[1]); });
    return prefix + String(mx + 1).padStart(width, "0");
  }
  function nextSpotId(cc) {
    const pre = cc === "DE" ? "DE-HI-" : cc + "-"; let mx = 0;
    D.spots.forEach(s => { if (s.id.startsWith(pre)) { const n = parseInt(s.id.slice(pre.length)); if (!isNaN(n)) mx = Math.max(mx, n); } });
    return pre + F.pad(mx + 1);
  }
  const spotById = id => D.spots.find(s => s.id === id);
  const activeSession = () => D.sessions.find(s => s.live && s.date && !s.end_time);
  function banner(t, err) { show($("banner"), t, err); clearTimeout(banner.t); banner.t = setTimeout(() => $("banner").classList.add("hidden"), 7000); }

  /* ================= Supabase ================= */
  async function initAuth() {
    const C = window.FB_CONFIG || {};
    if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY || !window.supabase) { $("authInfo").textContent = "Cloud-Sync ist noch nicht eingerichtet (config.js). Die App speichert alles auf diesem Gerät."; $("authForm").classList.add("hidden"); setSync(); return; }
    SB = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await SB.auth.getSession(); await onUser(data.session ? data.session.user : null);
    SB.auth.onAuthStateChange((_e, sess) => { const u = sess ? sess.user : null; if ((u && u.id) !== (USER && USER.id)) onUser(u); });
  }
  async function onUser(u) {
    USER = u;
    $("authForm").classList.toggle("hidden", !!u); $("authOut").classList.toggle("hidden", !u);
    $("authInfo").textContent = u ? "Angemeldet als " + u.email + ". Deine Daten werden mit der Cloud abgeglichen." : "Melde dich an, damit deine Daten auf allen Geräten gleich sind.";
    setSync();
    if (!u) return;
    if (localStorage.getItem(LS.synced) !== u.id) {
      TABLES.forEach(t => D[t].forEach(r => enqueue(t, "up", r.id)));
      localStorage.setItem(LS.synced, u.id); saveLocal();
    }
    await flush(); await pull(); await flush();
  }
  $("btnLogin").addEventListener("click", async () => {
    if (!SB) return; const { error } = await SB.auth.signInWithPassword({ email: $("au-mail").value.trim(), password: $("au-pw").value });
    if (error) show($("authMsg"), "Anmeldung fehlgeschlagen: " + error.message, true); else show($("authMsg"), "Angemeldet.");
  });
  $("btnSignup").addEventListener("click", async () => {
    if (!SB) return; const { error } = await SB.auth.signUp({ email: $("au-mail").value.trim(), password: $("au-pw").value, options: { emailRedirectTo: location.href.split("#")[0] } });
    if (error) show($("authMsg"), "Konto anlegen fehlgeschlagen: " + error.message, true);
    else show($("authMsg"), "Konto angelegt. Bestätige den Link in der E-Mail und melde dich dann hier an.");
  });
  $("btnLogout").addEventListener("click", async () => { if (SB) await SB.auth.signOut(); onUser(null); });
  $("btnSync").addEventListener("click", async () => { await flush(); await pull(); banner("Synchronisiert."); });
  window.addEventListener("online", () => { flush().then(pull).then(backfill); });
  window.addEventListener("offline", () => setSync());

  /* ================= GPS ================= */
  let lastPos = null;
  function getPos(timeout = 15000) {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("Dieses Gerät kann keinen Standort liefern."));
      navigator.geolocation.getCurrentPosition(p => { lastPos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() }; res(lastPos); },
        e => rej(new Error(e.code === 1 ? "Standortzugriff verweigert. Erlaube ihn in den Browser-Einstellungen." : "Standort nicht gefunden. Versuch es draußen noch einmal.")),
        { enableHighAccuracy: true, timeout, maximumAge: 20000 });
    });
  }

  /* ================= Session ================= */
  let pendingPos = null;
  $("btnStart").addEventListener("click", async () => {
    const b = $("btnStart"); b.disabled = true; $("gpsState").textContent = "Suche Standort …";
    try {
      const p = await getPos(); $("gpsState").textContent = `GPS ±${p.acc} m`;
      const n = F.nearestSpot(D.spots, p);
      if (n && n.d <= Math.max(30, p.acc)) await beginSession(n.spot.id, p, `Spot ${n.spot.id} erkannt (${Math.round(n.d)} m entfernt).`);
      else {
        pendingPos = p;
        const near = n ? spotById(n.spot.id) : null;
        $("ns-country").value = near ? (near.country || "DE") : "DE";
        $("ns-id").value = nextSpotId($("ns-country").value);
        $("ns-water").value = near && n.d < 3000 ? (near.water || "") : "";
        $("ns-zone").value = near && n.d < 300 ? (near.zone || "") : "";
        $("newSpotMsg").textContent = n ? `Neuer Platz: ${Math.round(n.d)} m vom nächsten Spot (${n.spot.id}) entfernt.` : "Erster Spot an dieser Stelle.";
        $("sessNone").classList.add("hidden"); $("newSpot").classList.remove("hidden");
      }
    } catch (e) { $("gpsState").textContent = ""; banner(e.message + " Du kannst den Spot auch von Hand wählen.", true); }
    b.disabled = false;
  });
  $("ns-country").addEventListener("change", () => $("ns-id").value = nextSpotId($("ns-country").value));
  $("btnCancelSpot").addEventListener("click", () => { $("newSpot").classList.add("hidden"); render(); });
  $("btnSaveSpot").addEventListener("click", async () => {
    const id = $("ns-id").value.trim(); if (!id) return banner("Bitte eine Spot-ID eingeben.", true);
    if (spotById(id)) return banner("Diese Spot-ID gibt es schon.", true);
    if (!pendingPos) return banner("Kein Standort vorhanden.", true);
    put("spots", { id, lat: +pendingPos.lat.toFixed(6), lon: +pendingPos.lon.toFixed(6), country: $("ns-country").value, water: $("ns-water").value.trim(), zone: $("ns-zone").value.trim() || "Neu",
      depth: $("ns-depth").value ? +$("ns-depth").value : null, struct: $("ns-struct").value.trim() });
    $("newSpot").classList.add("hidden");
    await beginSession(id, pendingPos, `Spot ${id} angelegt.`);
  });
  $("btnStartManual").addEventListener("click", () => { const id = $("s-spot").value; if (!id) return; beginSession(id, null, "", $("s-start").value); });
  async function beginSession(spotId, p, msg, start) {
    const sp = spotById(spotId); const id = nextId("sessions", "S", 4);
    const s = { id, date: F.todayISO(), start_time: start || F.nowHM(), end_time: null, spots: [spotId], country: sp.country || "DE", live: true, attempts: [], note: "", weather: null, lat: p ? p.lat : sp.lat, lon: p ? p.lon : sp.lon, extra_misses: 0 };
    put("sessions", s); $("f-spot").value = spotId; banner((msg ? msg + " " : "") + "Session " + id + " läuft.");
    try { const w = await F.fetchWeather(s.lat, s.lon, s.date, s.start_time); put("sessions", { id, weather: w }); }
    catch (e) { banner("Wetter gerade nicht abrufbar. Es wird nachgetragen, sobald du online bist.", true); }
  }
  $("btnEnd").addEventListener("click", () => { const a = activeSession(); if (a) put("sessions", { id: a.id, end_time: F.nowHM() }); });

  /* ================= Fang melden ================= */
  let editId = null;
  function fillForm(v) {
    const set = (id, val) => { if (val !== null && val !== undefined && val !== "") $(id).value = val; };
    set("f-result", v.result); set("f-species", v.species); set("f-cm", v.cm); set("f-time", v.time); set("f-lure", v.lure); set("f-size", v.size); set("f-color", v.color);
    set("f-weight", v.weight); set("f-rig", v.rig); set("f-setup", v.setup); set("f-retrieve", v.retrieve); set("f-tempo", v.tempo); set("f-bite", v.bite);
    set("f-wt", v.waterTemp ?? v.water_temp); set("f-release", v.release); set("f-notes", v.notes);
  }
  function resetForm() {
    ["c-text", "f-species", "f-cm", "f-lure", "f-size", "f-color", "f-weight", "f-rig", "f-retrieve", "f-bite", "f-notes"].forEach(i => $(i).value = "");
    $("f-tempo").value = ""; $("f-setup").value = lastSetup(); $("f-result").value = "Gelandet"; $("f-release").value = "Zurückgesetzt"; $("f-time").value = F.nowHM();
    editId = null; $("catchTitle").textContent = "Fang oder Biss melden"; $("btnDelete").classList.add("hidden"); $("btnCancelEdit").classList.add("hidden");
  }
  function lastSetup() { const c = D.catches.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0]; return c ? (c.setup || "") : ""; }
  $("btnParse").addEventListener("click", () => {
    const v = F.parse($("c-text").value); fillForm(v);
    banner(Object.keys(v).length ? "Felder ausgefüllt. Kurz prüfen, dann speichern." : "Nichts erkannt. Füll die Felder bitte selbst aus.", !Object.keys(v).length);
  });
  $("btnCancelEdit").addEventListener("click", resetForm);
  $("btnSave").addEventListener("click", async () => {
    const b = $("btnSave");
    const result = $("f-result").value, species = $("f-species").value.trim();
    if (result === "Gelandet" && (!species || !$("f-cm").value)) return show($("saveMsg"), "Für einen Fang bitte Fischart und Länge angeben.", true);
    let spot = spotById($("f-spot").value);
    if (!spot) return show($("saveMsg"), "Bitte zuerst einen Spot wählen oder eine Session starten.", true);
    b.disabled = true;
    const a = activeSession(); const old = editId ? D.catches.find(c => c.id === editId) : null;
    const date = old ? old.date : (a ? a.date : F.todayISO()); const time = $("f-time").value || F.nowHM();
    let pos = null;
    if (!old && a) { try { pos = await getPos(8000); } catch (e) { pos = null; } }
    if (pos) {
      const n = F.nearestSpot(D.spots, pos);
      if (n && n.d <= Math.max(30, pos.acc) && n.spot.id !== spot.id) { spot = n.spot; $("f-spot").value = spot.id; }
      else if (n && n.d > Math.max(40, pos.acc * 1.5) && confirm(`Du bist ${Math.round(n.d)} m vom nächsten Spot (${n.spot.id}) entfernt. Hier einen neuen Spot anlegen?`)) {
        const sid = nextSpotId(spot.country || "DE");
        put("spots", { id: sid, lat: +pos.lat.toFixed(6), lon: +pos.lon.toFixed(6), country: spot.country || "DE", water: spot.water || "", zone: n.d < 300 ? spot.zone : "Neu", depth: null, struct: "" }, { quiet: true });
        spot = spotById(sid);
        if (a && !(a.spots || []).includes(sid)) put("sessions", { id: a.id, spots: (a.spots || []).concat([sid]) }, { quiet: true });
      }
    }
    const st = F.sunTimes(spot.lat, spot.lon, date); const mo = F.moon(date, time);
    const num = id => $(id).value === "" ? null : +$(id).value;
    const row = {
      id: old ? old.id : nextId("catches", "F", 4), session: old ? old.session : (a ? a.id : null), date, time, spot: spot.id, country: spot.country || "DE",
      lat: pos ? +pos.lat.toFixed(6) : (old ? old.lat : spot.lat), lon: pos ? +pos.lon.toFixed(6) : (old ? old.lon : spot.lon),
      result, species: species || null, cm: result === "Gelandet" ? num("f-cm") : null, lure: $("f-lure").value.trim(), size: num("f-size"), color: $("f-color").value.trim(), weight: num("f-weight"),
      rig: $("f-rig").value.trim(), setup: $("f-setup").value, retrieve: $("f-retrieve").value.trim(), tempo: $("f-tempo").value, bite: $("f-bite").value.trim(), water_temp: num("f-wt"),
      release: result === "Gelandet" ? $("f-release").value : "", notes: $("f-notes").value.trim(), raw: $("c-text").value.trim() || (old ? old.raw : ""),
      sunset: F.m2hm(st.su), light: F.lightPhase(time, st), moon: mo.name, moon_ill: mo.ill, capture: old ? old.capture : "Live"
    };
    const changedWx = !old || old.spot !== row.spot || old.time !== row.time;
    if (changedWx) row.weather_status = "offen";
    put("catches", row);
    show($("saveMsg"), `${row.id} gespeichert: ${result === "Gelandet" ? species + " " + row.cm + " cm" : result} an ${spot.id}.`);
    $("saveMsg").classList.remove("err");
    resetForm(); b.disabled = false;
    if (changedWx) { try { const w = await F.fetchWeather(row.lat, row.lon, row.date, row.time); put("catches", Object.assign({ id: row.id }, w)); show($("saveMsg"), `${row.id} gespeichert, Wetter: ${F.wxSummary(w)}.`); } catch (e) { } }
  });
  $("btnDelete").addEventListener("click", () => { if (editId && confirm(editId + " wirklich löschen?")) { del("catches", editId); resetForm(); banner("Eintrag gelöscht."); } });
  $("btnAttempt").addEventListener("click", () => {
    const a = activeSession(); const t = $("a-text").value.trim();
    if (!a) return $("attMsg").textContent = "Starte zuerst eine Session.";
    if (!t) return $("attMsg").textContent = "Was hast du probiert?";
    put("sessions", { id: a.id, attempts: (a.attempts || []).concat([{ time: F.nowHM(), spot: $("f-spot").value, text: t }]) });
    $("a-text").value = ""; $("attMsg").textContent = "Gespeichert.";
  });
  function editCatch(id) {
    const c = D.catches.find(x => x.id === id); if (!c) return;
    resetForm(); editId = id; fillForm(c); $("f-spot").value = c.spot; $("f-time").value = c.time || ""; $("f-release").value = c.release || "";
    $("c-text").value = c.raw || ""; $("catchTitle").textContent = id + " bearbeiten"; $("btnDelete").classList.remove("hidden"); $("btnCancelEdit").classList.remove("hidden");
    showTab("melden"); $("catchCard").scrollIntoView({ behavior: "smooth" });
  }

  /* ================= Sprechen ================= */
  (function () {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("btnMic").classList.add("hidden"); return; }
    let rec = null, base = "";
    $("btnMic").addEventListener("click", () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = "de-DE"; rec.interimResults = true; rec.continuous = true;
      base = $("c-text").value.trim();
      rec.onresult = e => { let fin = "", tmp = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) fin += r[0].transcript; else tmp += r[0].transcript; } if (fin) base = (base + " " + fin).trim(); $("c-text").value = (base + " " + tmp).trim(); };
      rec.onend = () => { rec = null; $("btnMic").setAttribute("aria-pressed", "false"); $("btnMic").textContent = "Sprechen"; if ($("c-text").value.trim()) $("btnParse").click(); };
      rec.onerror = e => { if (e.error === "not-allowed") banner("Mikrofon nicht erlaubt. Du kannst auch das Mikrofon der Tastatur nutzen.", true); };
      rec.start(); $("btnMic").setAttribute("aria-pressed", "true"); $("btnMic").textContent = "Fertig";
    });
  })();

  /* ================= Wetter nachtragen ================= */
  let backfilling = false;
  async function backfill(manual) {
    if (backfilling || !navigator.onLine) { if (manual) $("bfMsg").textContent = "Offline – später noch einmal."; return; }
    backfilling = true; let n = 0, fail = 0;
    const open = D.catches.filter(c => c.weather_status === "offen" || (!c.weather_status && c.air_temp == null));
    for (const c of open) {
      const sp = spotById(c.spot); const lat = c.lat ?? (sp && sp.lat), lon = c.lon ?? (sp && sp.lon); if (lat == null || !c.date) continue;
      try { const w = await F.fetchWeather(lat, lon, c.date, c.time); put("catches", Object.assign({ id: c.id }, w), { quiet: true }); n++; } catch (e) { fail++; }
    }
    for (const s of D.sessions.filter(s => s.date && !s.weather)) {
      const sp = spotById((s.spots || [])[0]); const lat = s.lat ?? (sp && sp.lat), lon = s.lon ?? (sp && sp.lon); if (lat == null) continue;
      try { const w = await F.fetchWeather(lat, lon, s.date, s.start_time); put("sessions", { id: s.id, weather: w }, { quiet: true }); n++; } catch (e) { fail++; }
    }
    backfilling = false; render();
    if (manual) $("bfMsg").textContent = n ? `${n} Einträge ergänzt${fail ? `, ${fail} fehlgeschlagen` : ""}.` : (fail ? "Wetterdienst nicht erreichbar." : "Alles vollständig.");
  }
  $("btnBackfill").addEventListener("click", () => backfill(true));

  /* ================= Rendering ================= */
  let country = "all", filt = "all", selected = null, MAP = null, LAYER = null, POSM = null;
  function inC(x) { return country === "all" || (x.country || "DE") === country; }
  function fillSelects() {
    const sorted = D.spots.slice().sort((a, b) => a.id.localeCompare(b.id));
    const opts = sorted.map(s => `<option value="${esc(s.id)}">${esc(s.id)} · ${esc(s.zone || "")}</option>`).join("");
    for (const id of ["s-spot", "f-spot"]) { const v = $(id).value; if ($(id).dataset.o !== opts) { $(id).innerHTML = opts; $(id).dataset.o = opts; } if (v) $(id).value = v; }
    if (!$("f-setup").options.length) { $("f-setup").innerHTML = `<option value=""></option>` + F.TACKLE.map(t => `<option value="${t[0]}">${t[0]} – ${esc(t[1].split(" · ")[0])}</option>`).join(""); $("f-setup").value = lastSetup(); }
    const lures = [...new Set(D.catches.map(c => c.lure).filter(Boolean))].sort();
    $("lureList").innerHTML = lures.map(l => `<option>${esc(l)}</option>`).join("");
    const cs = [...new Set(D.spots.map(s => s.country || "DE"))].sort();
    const seg = ["all", ...cs].map(c => `<button data-c="${c}" aria-pressed="${country === c}">${c === "all" ? "Alle Länder" : c}</button>`).join("");
    for (const id of ["segCountry", "segCountry2"]) if ($(id).innerHTML !== seg) { $(id).innerHTML = seg; $(id).querySelectorAll("button").forEach(b => b.addEventListener("click", () => { country = b.dataset.c; selected = null; render(); fitMap(); })); }
  }
  function renderStatus() {
    const a = activeSession(); const open = D.catches.filter(c => c.weather_status === "offen").length;
    $("status").innerHTML = (a ? `<span class="pill live">${esc(a.id)} läuft</span>` : "") + (open ? `<span class="pill warn">${open} × Wetter offen</span>` : "");
  }
  function renderSession() {
    const a = activeSession(); const newOpen = !$("newSpot").classList.contains("hidden");
    $("sessNone").classList.toggle("hidden", !!a || newOpen); $("sessLive").classList.toggle("hidden", !a);
    if (!$("s-start").value) $("s-start").value = F.nowHM();
    if (!a) return;
    const mins = a.date === F.todayISO() ? ((F.hm2m(F.nowHM()) - F.hm2m(a.start_time)) + 1440) % 1440 : null;
    $("sl-time").textContent = mins == null ? "–" : Math.floor(mins / 60) + ":" + F.pad(mins % 60) + " h";
    const sp = spotById((a.spots || [])[0]); const st = sp ? F.sunTimes(sp.lat, sp.lon, a.date) : null;
    $("sl-meta").textContent = `${a.id} · Start ${a.start_time} · ${(a.spots || []).join(", ")}${st ? ` · Sonnenuntergang ${F.m2hm(st.su)}, Dämmerung bis ${F.m2hm(st.civ)}` : ""}`;
    const cs = D.catches.filter(c => c.session === a.id); const fish = cs.filter(c => c.result === "Gelandet").length;
    $("sl-chips").innerHTML = `<span class="chip good">${fish} Fisch${fish === 1 ? "" : "e"}</span><span class="chip">${cs.length} Biss${cs.length === 1 ? "" : "e"}</span>` + ((a.attempts || []).length ? `<span class="chip">${a.attempts.length} × ohne Biss</span>` : "");
    const w = a.weather;
    $("sl-wx").innerHTML = w ? [["Luft", fmt(w.air_temp) + " °C"], ["Luftdruck", (w.pressure ?? "–") + " hPa"], ["Tendenz", (w.pressure_trend || "–").split(" (")[0]], ["Wind", F.compass(w.wind_dir) + " " + Math.round(w.wind_speed ?? 0) + " km/h"], ["Bewölkung", Math.round(w.cloud_cover ?? 0) + " %"], ["Wetter", F.wmo(w.weather_code)]].map(x => `<div>${x[0]}<b>${esc(x[1])}</b></div>`).join("") : `<div>Wetter<b>wird geladen …</b></div>`;
    if (!editId && sp && !$("f-spot").dataset.user) $("f-spot").value = sp.id;
  }
  $("f-spot").addEventListener("change", () => $("f-spot").dataset.user = "1");

  function spotStats(s) {
    const pass = c => filt === "all" || (filt === "other" ? c.species !== "Barsch" && c.species !== "Döbel" : c.species === filt);
    const fs = D.catches.filter(c => c.spot === s.id && c.result === "Gelandet" && pass(c)); const n = fs.length;
    const miss = filt === "all" ? D.catches.filter(c => c.spot === s.id && c.result !== "Gelandet").length : 0;
    return { fs, n, avg: n ? fs.reduce((a, f) => a + (f.cm || 0), 0) / n : null, max: n ? Math.max(...fs.map(f => f.cm || 0)) : null, miss };
  }
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const colorFor = v => v == null ? css("--panel") : v < 18 ? css("--accent-soft") : v <= 25 ? css("--accent-mid") : css("--accent");
  function ensureMap() {
    if (MAP || !window.L) return;
    MAP = L.map("map", { zoomControl: true }).setView([52.148, 9.94], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap-Mitwirkende" }).addTo(MAP);
    LAYER = L.layerGroup().addTo(MAP); renderMap(); fitMap();
  }
  function fitMap() { if (!MAP) return; const pts = D.spots.filter(inC).map(s => [s.lat, s.lon]); if (pts.length) MAP.fitBounds(pts, { padding: [30, 30], maxZoom: 16 }); }
  function renderMap() {
    const list = D.spots.filter(inC).map(s => ({ s, st: spotStats(s) })).sort((a, b) => b.st.n - a.st.n || (b.st.avg || 0) - (a.st.avg || 0) || b.st.miss - a.st.miss);
    const maxN = Math.max(1, ...list.map(x => x.st.n));
    $("spotBody").innerHTML = list.map(({ s, st }) => `<tr class="row" data-id="${esc(s.id)}"><td><b>${esc(s.id)}</b></td><td>${esc(s.zone || "")}</td><td class="n"><span class="bar" style="width:${st.n / maxN * 36}px"></span>${st.n}</td><td class="n">${fmt(st.avg)}</td><td class="n">${st.max ?? "–"}</td><td class="n">${st.miss || "–"}</td><td class="n">${s.depth != null ? fmt(s.depth) + " m" : "–"}</td></tr>`).join("");
    $("spotBody").querySelectorAll("tr").forEach(tr => tr.addEventListener("click", () => { selected = tr.dataset.id; const s = spotById(selected); if (MAP && s) MAP.setView([s.lat, s.lon], 17); renderDetail(); }));
    renderDetail();
    if (!MAP) return;
    LAYER.clearLayers();
    list.slice().reverse().forEach(({ s, st }) => {
      const r = st.n ? 7 + 5 * Math.sqrt(st.n) : 6;
      if (st.miss) L.circleMarker([s.lat, s.lon], { radius: r + 4, color: css("--miss"), weight: 2, dashArray: "4 4", fill: false, interactive: false }).addTo(LAYER);
      const m = L.circleMarker([s.lat, s.lon], { radius: r, color: st.n ? "#ffffff" : css("--empty"), weight: 2, fillColor: colorFor(st.avg), fillOpacity: st.n ? 0.95 : 1 }).addTo(LAYER);
      m.bindTooltip(`${s.id}: ${st.n} Fisch${st.n === 1 ? "" : "e"}${st.n ? ", Ø " + fmt(st.avg) + " cm" : ""}`, { direction: "top" });
      m.on("click", () => { selected = s.id; renderDetail(); $("spotDetail").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    });
    if (lastPos) { if (POSM) POSM.remove(); POSM = L.circleMarker([lastPos.lat, lastPos.lon], { radius: 6, color: "#1e6fd9", weight: 3, fillColor: "#1e6fd9", fillOpacity: .4 }).addTo(MAP).bindTooltip("Du"); }
  }
  function renderDetail() {
    const s = spotById(selected); if (!s) { $("spotDetail").innerHTML = `<p class="hint">Tippe auf einen Punkt oder eine Zeile.</p>`; return; }
    const st = spotStats(s); const all = D.catches.filter(c => c.spot === s.id).sort((a, b) => (b.cm || 0) - (a.cm || 0));
    $("spotDetail").innerHTML = `<h3>${esc(s.id)}</h3><p class="hint">${esc([s.water, s.zone].filter(Boolean).join(" · "))} · ${s.depth != null ? fmt(s.depth) + " m" : "Tiefe ?"} · ${esc(s.country || "DE")}</p>
      <div class="chips"><span class="chip ${st.n ? "good" : ""}">${st.n} Fisch${st.n === 1 ? "" : "e"}</span>${st.n ? `<span class="chip">Ø ${fmt(st.avg)} cm</span><span class="chip">max ${st.max} cm</span>` : ""}${st.miss ? `<span class="chip miss">${st.miss} Fehlbiss</span>` : ""}</div>
      ${s.struct ? `<p style="margin:0">${esc(s.struct)}</p>` : ""}
      ${all.length ? `<ul class="fl">${all.map(c => `<li class="${c.result !== "Gelandet" ? "missed" : c.cm > 25 ? "big" : ""}"><b>${c.result === "Gelandet" ? esc(c.species) + " " + c.cm + " cm" : esc(c.result)}</b> · ${dDE(c.date)} ${esc(c.time || "")}<small>${esc([c.lure, c.size ? c.size + '"' : "", c.color, c.weight ? c.weight + " g" : "", c.setup, c.light, c.pressure ? c.pressure + " hPa " + (c.pressure_trend || "").split(" (")[0] : ""].filter(Boolean).join(" · "))}</small></li>`).join("")}</ul>` : `<p class="hint">Noch kein Fisch.</p>`}
      <p class="hint">${s.lat.toFixed(6)}, ${s.lon.toFixed(6)} · <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">Route</a></p>`;
  }
  document.querySelectorAll("#segSpecies button").forEach(b => b.addEventListener("click", () => { filt = b.dataset.f; document.querySelectorAll("#segSpecies button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderMap(); }));

  function renderAnalysis() {
    const cs = D.catches.filter(inC); const ss = D.sessions.filter(s => s.date && inC(s));
    const fish = cs.filter(c => c.result === "Gelandet"); const extra = D.sessions.reduce((a, s) => a + (s.extra_misses || 0), 0);
    let hrs = 0, ft = 0; ss.forEach(s => { const h = F.durH(s); if (h) { hrs += h; ft += D.catches.filter(c => c.session === s.id && c.result === "Gelandet").length; } });
    const big = fish.slice().sort((a, b) => (b.cm || 0) - (a.cm || 0))[0];
    $("kpi").innerHTML = [[fish.length, "Fische"], [fmt(hrs) + " h", "Angelzeit"], [hrs ? fmt(ft / hrs, 2) : "–", "Fische pro Stunde"], [cs.length ? Math.round(fish.length / (cs.length + (country === "all" ? extra : 0)) * 100) + " %" : "–", "Landequote"], [big ? big.cm + " cm" : "–", big ? "Größter: " + big.species : "Größter Fisch"], [ss.length, "Sessions"]]
      .map(x => `<div class="tile"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join("");
    const blocks = [
      ["Lichtphase", c => c.light], ["Setup", c => c.setup], ["Köder", c => c.lure], ["Farbe", c => c.color], ["Montage", c => c.rig], ["Tempo", c => c.tempo],
      ["Luftdruck-Tendenz", c => (c.pressure_trend || "").split(" (")[0] || null], ["Mondphase", c => c.moon], ["Abschnitt", c => (spotById(c.spot) || {}).zone], ["Monat", c => c.date ? c.date.slice(0, 7) : null]
    ];
    $("analysis").innerHTML = blocks.map(([title, fn]) => {
      const g = F.groupStats(cs, fn); const mx = Math.max(1, ...g.map(x => x.fish));
      return `<div class="card"><h3>Nach ${esc(title)}</h3><div class="tblwrap"><table><thead><tr><th>${esc(title)}</th><th class="n">Bisse</th><th class="n">Fische</th><th class="n">Ø cm</th><th class="n">Max</th></tr></thead><tbody>${g.map(x => `<tr><td>${esc(x.key)}</td><td class="n">${x.bites}</td><td class="n"><span class="bar" style="width:${x.fish / mx * 30}px"></span>${x.fish}</td><td class="n">${fmt(x.avg)}</td><td class="n">${x.max || "–"}</td></tr>`).join("")}</tbody></table></div></div>`;
    }).join("") + (() => {
      const rows = ss.map(s => { const h = F.durH(s); const n = D.catches.filter(c => c.session === s.id && c.result === "Gelandet").length; const sp = spotById((s.spots || [])[0]); const st = sp ? F.sunTimes(sp.lat, sp.lon, s.date) : null; const rel = st && s.start_time ? Math.round(F.hm2m(s.start_time) - st.su) : null; return { s, h, n, rel }; }).filter(x => x.h);
      return `<div class="card"><h3>Fische pro Stunde je Session</h3><p class="hint">Start relativ zum Sonnenuntergang (negativ = vorher)</p><div class="tblwrap"><table><thead><tr><th>Session</th><th class="n">Start vs. SU</th><th class="n">Dauer</th><th class="n">Fische</th><th class="n">F/Std</th></tr></thead><tbody>${rows.sort((a, b) => b.n / b.h - a.n / a.h).map(x => `<tr><td>${esc(x.s.id)} · ${dDE(x.s.date)}</td><td class="n">${x.rel == null ? "–" : (x.rel > 0 ? "+" : "") + x.rel + " min"}</td><td class="n">${fmt(x.h, 2)} h</td><td class="n">${x.n}</td><td class="n">${fmt(x.n / x.h, 2)}</td></tr>`).join("")}</tbody></table></div></div>`;
    })();
  }
  function renderBook() {
    const cs = D.catches.filter(inC).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    $("catchBody").innerHTML = cs.map(c => `<tr class="row" data-id="${esc(c.id)}"><td>${esc(c.id)}</td><td>${dDE(c.date)}</td><td>${esc(c.time || "")}</td><td>${esc(c.spot)}</td><td>${c.result === "Gelandet" ? esc(c.species) : `<span class="chip miss">${esc(c.result)}</span>`}</td><td class="n">${c.cm ?? "–"}</td><td>${esc([c.lure, c.size ? c.size + '"' : "", c.color].filter(Boolean).join(" · "))}</td><td>${esc(c.setup || "")}</td><td>${c.weather_status === "offen" ? `<span class="chip warn">offen</span>` : c.air_temp != null ? esc(fmt(c.air_temp) + " °C · " + (c.pressure ?? "–") + " hPa") : esc(c.weather_status || "")}</td></tr>`).join("") || `<tr><td colspan="9" class="hint">Noch keine Einträge. Unter „Konto“ kannst du deine bisherigen Fänge importieren.</td></tr>`;
    $("catchBody").querySelectorAll("tr.row").forEach(tr => tr.addEventListener("click", () => editCatch(tr.dataset.id)));
    const ss = D.sessions.filter(s => s.date && inC(s)).sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));
    $("sessBody").innerHTML = ss.map(s => { const h = F.durH(s); const f = D.catches.filter(c => c.session === s.id && c.result === "Gelandet").length; const b = D.catches.filter(c => c.session === s.id).length;
      return `<tr><td>${esc(s.id)}${s.live && !s.end_time ? ' <span class="chip good">läuft</span>' : ""}</td><td>${dDE(s.date)}</td><td>${esc(s.start_time || "")}–${esc(s.end_time || "")}</td><td>${esc((s.spots || []).join(", "))}</td><td class="n">${h ? fmt(h, 2) + " h" : "–"}</td><td class="n">${b}</td><td class="n">${f}</td><td class="n">${h ? fmt(f / h, 2) : "–"}</td><td>${s.weather ? esc(F.wxSummary(s.weather)) : esc(s.note || "")}</td></tr>`; }).join("");
    $("dataInfo").textContent = `${D.spots.length} Spots · ${D.sessions.filter(s => s.date).length} Sessions · ${D.catches.length} Einträge auf diesem Gerät${Q.length ? ` · ${Q.length} noch nicht synchronisiert` : ""}.`;
    $("tackleBody").innerHTML = F.TACKLE.map(t => `<tr><td><b>${t[0]}</b></td><td>${esc(t[1])}</td></tr>`).join("");
  }
  function render() { fillSelects(); renderStatus(); renderSession(); renderMap(); renderAnalysis(); renderBook(); setSync(); }

  /* ================= Reiter ================= */
  function showTab(v) {
    document.querySelectorAll(".tabbar button").forEach(x => x.setAttribute("aria-selected", x.dataset.v === v));
    document.querySelectorAll(".view").forEach(x => x.classList.toggle("on", x.id === "v-" + v));
    if (v === "karte") { ensureMap(); setTimeout(() => { if (MAP) { MAP.invalidateSize(); renderMap(); } }, 50); }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabbar button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.v)));

  /* ================= Import / Export ================= */
  function importData(obj, label) {
    let n = 0;
    TABLES.forEach(t => (obj[t] || []).forEach(r => { if (!r.id) return; const i = D[t].findIndex(x => x.id === r.id); const row = clean(t, r); if (i >= 0) D[t][i] = row; else D[t].push(row); enqueue(t, "up", r.id); n++; }));
    saveLocal(); render(); flush(); show($("dataMsg"), `${label}: ${n} Datensätze übernommen.`);
  }
  $("btnImport").addEventListener("click", () => $("fileImport").click());
  $("fileImport").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; try { importData(JSON.parse(await f.text()), "Sicherung"); } catch (x) { show($("dataMsg"), "Datei nicht lesbar.", true); } });
  function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  $("btnBackup").addEventListener("click", () => download("Fangbuch_" + F.todayISO() + ".json", new Blob([JSON.stringify(D, null, 1)], { type: "application/json" })));
  function exportXlsx() {
    if (!window.XLSX) return banner("Excel-Export braucht einmal Internet.", true);
    const wb = XLSX.utils.book_new();
    const cR = D.catches.slice().sort((a, b) => a.id.localeCompare(b.id)).map(c => ({ "Fang-ID": c.id, Session: c.session || "", Datum: c.date, Uhrzeit: c.time, Land: c.country, Spot: c.spot, Ergebnis: c.result, Fischart: c.species || "", "Länge cm": c.cm ?? "",
      Köder: c.lure || "", "Größe Zoll": c.size ?? "", Farbe: c.color || "", "Gewicht g": c.weight ?? "", Montage: c.rig || "", Setup: c.setup || "", Führung: c.retrieve || "", Tempo: c.tempo || "", Biss: c.bite || "",
      "Wasser °C": c.water_temp ?? "", "Luft °C": c.air_temp ?? "", "Luftdruck hPa": c.pressure ?? "", "Drucktendenz": c.pressure_trend || "", "Luftfeuchte %": c.humidity ?? "", "Wind km/h": c.wind_speed ?? "", "Windrichtung": F.compass(c.wind_dir), "Böen km/h": c.wind_gust ?? "",
      "Bewölkung %": c.cloud_cover ?? "", "Niederschlag mm": c.precip ?? "", Wetter: F.wmo(c.weather_code), Sonnenuntergang: c.sunset || "", Lichtphase: c.light || "", Mond: c.moon || "", "Mond %": c.moon_ill ?? "",
      Verbleib: c.release || "", Erfassung: c.capture || "", Wetterquelle: c.weather_src || c.weather_status || "", Breite: c.lat ?? "", Länge: c.lon ?? "", Notizen: c.notes || "" }));
    const sR = D.sessions.slice().sort((a, b) => a.id.localeCompare(b.id)).map(s => ({ Session: s.id, Datum: s.date || "", Start: s.start_time || "", Ende: s.end_time || "", "Dauer h": F.durH(s) ?? "", Land: s.country || "", Spots: (s.spots || []).join(", "),
      Bisse: D.catches.filter(c => c.session === s.id).length + (s.extra_misses || 0), Fische: D.catches.filter(c => c.session === s.id && c.result === "Gelandet").length, "Wetter Start": s.weather ? F.wxSummary(s.weather) : "", "Versuche ohne Biss": (s.attempts || []).map(a => a.text).join("; "), Notiz: s.note || "" }));
    const pR = D.spots.slice().sort((a, b) => a.id.localeCompare(b.id)).map(s => ({ Spot: s.id, Land: s.country || "", Gewässer: s.water || "", Abschnitt: s.zone || "", Breite: s.lat, Länge: s.lon, "Tiefe m": s.depth ?? "", Struktur: s.struct || "", Fische: D.catches.filter(c => c.spot === s.id && c.result === "Gelandet").length }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cR), "Fänge"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sR), "Sessions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pR), "Spots"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(F.TACKLE.map(t => ({ Code: t[0], Kombo: t[1] }))), "Tackle");
    download("Fangbuch_" + F.todayISO() + ".xlsx", new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }
  $("btnExport").addEventListener("click", exportXlsx); $("btnExport2").addEventListener("click", exportXlsx);

  /* ================= Start ================= */
  resetForm(); render();
  setInterval(() => { if (activeSession()) renderSession(); }, 30000);
  initAuth().catch(e => setSync("Anmeldung: " + e.message)).finally(() => { if (navigator.onLine) setTimeout(() => backfill(false), 1500); });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
  window.FBAPP = { D, render, importData, showTab, get Q() { return Q; } };
})();
