/* Fangbuch – Vorhersage: Köderart, Ködertyp, Größe, Farbe und Führung je Zielfisch.
   1) Regeln: Grundvorliebe je Fisch + Zu-/Abschläge je Bedingung (allgemeine Erfahrungswerte).
   2) Lernen: eigene Fänge (Bonus) und Köder ohne Biss (Abzug), gewichtet nach Ähnlichkeit der Bedingungen.
   3) Bedingungen kommen beim Öffnen automatisch aus Standort, Live-Wetter, Uhrzeit, Spot und letzter Messung. */
(function () {
  "use strict";
  const F = window.FB, APP = window.FBAPP;
  if (!F || !APP) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v, d = 1) => v == null || isNaN(v) ? "–" : Number(v).toFixed(d).replace(".", ",");
  const dDE = iso => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : "–";

  const FISH = ["Barsch", "Zander", "Hecht"];
  const OUT = [["art", "Köderart", F.LURE_TYPES], ["akt", "Ködertyp", F.LURE_ACTIONS],
    ["size", "Ködergröße", ["klein", "mittel", "groß"]], ["farbe", "Farbe", F.COLOR_CLASSES], ["fuehr", "Führung", ["langsam", "schnell", "aggressiv"]]];
  const SIZE_TXT = ["bis 7 cm", "7–12 cm", "über 12 cm"];
  const COND = [
    ["temp", "Wassertemperatur", "kalt < 8 °C · warm > 16 °C", ["kalt", "mittel", "warm"], ["kaltem Wasser", "mittlerer Wassertemperatur", "warmem Wasser"]],
    ["licht", "Licht", "Dämmerung gilt auch nachts", ["sonnig", "bedeckt", "Dämmerung"], ["viel Licht", "bedecktem Himmel", "Dämmerung"]],
    ["truebe", "Wasser", "", F.CLARITY, ["klarem Wasser", "leicht trübem Wasser", "trübem Wasser"]],
    ["druck", "Luftdruck", "", ["fallend", "stabil", "steigend"], ["fallendem Luftdruck", "stabilem Luftdruck", "steigendem Luftdruck"]],
    ["wind", "Wind", "still < 8 · stark > 25 km/h", ["still", "mäßig", "stark"], ["Windstille", "leichtem Wind", "starkem Wind"]],
    ["tiefe", "Tiefe", "flach < 2 m · tief > 5 m", ["flach", "mittel", "tief"], ["flachem Wasser", "mittlerer Tiefe", "großer Tiefe"]]];
  const BASE = {
    Barsch: { art: [3, 1, 1], akt: [2, 1, 1], size: [3, 1.5, 0], farbe: [2, 1, 1], fuehr: [2, 1, 1] },
    Zander: { art: [3, 1, 0], akt: [2, 2, 0], size: [1, 3, 1], farbe: [2, 1, 1.5], fuehr: [3, 1, 1] },
    Hecht: { art: [2, 2.5, 1], akt: [2, 0, 2], size: [0, 2, 3], farbe: [1, 1, 2], fuehr: [1, 2, 2] }
  };
  const MOD = {
    temp: [{ fuehr: [3, -2, -1], akt: [0, 2, -1], size: [1, 0, -0.5], art: [1, -0.5, 0.5] }, { fuehr: [0, 1, 1], akt: [1, 0, 0] }, { fuehr: [-1, 2, 2], akt: [1, -1, 2], art: [-0.5, 2, 1], size: [0, 0.5, 0.5] }],
    licht: [{ farbe: [2, 0, -1], size: [1, 0, -0.5], akt: [0, 1, 0] }, { farbe: [1, 0, 1], akt: [1, 0, 0] }, { farbe: [-1, 3, 0.5], akt: [0, -1, 2], size: [-0.5, 1, 1], fuehr: [1, 0, -0.5] }],
    truebe: [{ farbe: [3, 0, -1], akt: [0, 1, -0.5], size: [1, 0, 0] }, { farbe: [1, 0, 1], akt: [1, 0, 0.5] }, { farbe: [-2, 2, 3], akt: [1, -2, 3], size: [-0.5, 0.5, 1] }],
    druck: [{ fuehr: [0, 1, 1.5], akt: [1, 0, 0.5] }, null, { fuehr: [2, -0.5, -1], size: [1, 0, -0.5], akt: [0, 1.5, -0.5] }],
    wind: [{ farbe: [1, 0, 0], akt: [0, 1, 0] }, { akt: [1, 0, 0], fuehr: [0, 1, 0] }, { akt: [0, -0.5, 1.5], farbe: [0, 0, 1], art: [0, 0, 1.5], size: [0, 1, 0] }],
    tiefe: [{ art: [0, 2, -1], fuehr: [0, 1, 0.5], akt: [0, 0, 1] }, { art: [1, 0, 0] }, { art: [2, -2, 2], fuehr: [1, -0.5, 0], akt: [0, 1, -0.5] }]
  };
  const FMOD = {
    Barsch: { temp: [null, null, { art: [0, 0, 1] }], tiefe: [null, null, { art: [0, 0, 1] }] },
    Zander: { temp: [{ akt: [0, 1, 0] }, null, null], licht: [null, null, { fuehr: [1, 0, 0] }] },
    Hecht: { temp: [{ size: [-1, 0, 1] }, null, { akt: [0, 0, 1] }], licht: [{ farbe: [1, 0, 0] }, null, null] }
  };
  const EX = {
    "0|0": "Gummifisch mit Schaufelschwanz am Jigkopf", "0|1": "No-Action-Shad, Pintail oder Krebs (Ned-, Drop-Shot- oder Texas-Rig)", "0|2": "Paddletail mit großer Schaufel oder Gummi als Chatterbait-Trailer",
    "1|0": "Crankbait oder Minnow mit Tauchschaufel", "1|1": "Suspender-Jerkbait oder Glidebait mit Pausen", "1|2": "Spinnerbait, Chatterbait oder Crank mit Rassel",
    "2|0": "Spinner oder Blinker", "2|1": "Zocker, Cicada oder Jigging-Spoon vertikal", "2|2": "Spinner mit Colorado-Blatt oder Tailspinner"
  };
  const FT = [["faulenzen, langsam über Grund", "langsam kurbeln, lange Pausen", "absinken lassen, langsam zupfen"],
    ["zügig einkurbeln, wenig Pausen", "schnell kurbeln, Richtungswechsel", "zügig einholen, knapp unter der Oberfläche"],
    ["hart jiggen, große Sprünge", "twitchen und jerken", "hart anjiggen, Spinnstopp"]];
  const FARB = ["Barsch-, Rotaugen- oder Grundeldekor", "Schwarz, Motoroil, Dunkelblau – klare Silhouette", "Chartreuse, Firetiger, Weiß oder UV"];

  /* ---------- Klassen der Bedingungen ---------- */
  const tcls = t => t < 8 ? 0 : t <= 16 ? 1 : 2;
  const wcls = v => v < 8 ? 0 : v <= 25 ? 1 : 2;
  const dcls = d => d < 2 ? 0 : d <= 5 ? 1 : 2;
  const pcls = tr => { tr = String(tr || ""); return !tr ? null : /fallend/.test(tr) ? 0 : /steigend/.test(tr) ? 2 : 1; };
  const isDusk = ph => /dämmerung|nacht|1\. stunde/i.test(ph || "");
  const lcls = (phase, cloud, code) => isDusk(phase) ? 2 : cloud == null ? null : (cloud >= 60 || (code != null && code >= 45)) ? 1 : 0;
  const spotOf = id => APP.D.spots.find(s => s.id === id);

  function condOfCatch(c) {
    const sp = spotOf(c.spot);
    return { temp: c.water_temp != null ? tcls(c.water_temp) : null, licht: lcls(c.light, c.cloud_cover, c.weather_code), truebe: c.clarity ? F.CLARITY.indexOf(c.clarity) : null,
      druck: pcls(c.pressure_trend), wind: c.wind_speed != null ? wcls(c.wind_speed) : null, tiefe: sp && sp.depth != null ? dcls(sp.depth) : null };
  }
  function condOfAttempt(s, a) {
    const sp = spotOf(a.spot || (s.spots || [])[0]); const w = s.weather || {};
    const ph = sp && s.date && a.time ? F.lightPhase(a.time, F.sunTimes(sp.lat, sp.lon, s.date)) : "";
    const same = APP.D.catches.filter(c => c.session === s.id);
    const wt = same.find(c => c.water_temp != null), cl = same.find(c => c.clarity);
    return { temp: wt ? tcls(wt.water_temp) : null, licht: lcls(ph, w.cloud_cover, w.weather_code), truebe: cl ? F.CLARITY.indexOf(cl.clarity) : null,
      druck: pcls(w.pressure_trend), wind: w.wind_speed != null ? wcls(w.wind_speed) : null, tiefe: sp && sp.depth != null ? dcls(sp.depth) : null };
  }
  /* Ähnlichkeit 0…1: gleiche Stufe 1, Nachbarstufe 0,35, unbekannt 0,5 */
  const CW = { temp: 2, licht: 1.5, truebe: 1.5, druck: 1, wind: 0.5, tiefe: 1 };
  function sim(cond, p) {
    let a = 0, b = 0;
    for (const k in CW) { const v = cond[k]; const s = v == null || v < 0 ? 0.5 : v === p[k] ? 1 : Math.abs(v - p[k]) === 1 ? 0.35 : 0; a += CW[k] * s; b += CW[k]; }
    return a / b;
  }

  /* ---------- Lernen aus Fängen und Versuchen ohne Biss ---------- */
  const RW = { "Gelandet": 1, "Ausgestiegen": 0.6, "Fehlbiss": 0.5, "Nachläufer": 0.3 };
  function learn(p) {
    const z = () => [0, 0, 0];
    const pos = {}, neg = {}, cnt = {}; OUT.forEach(([k]) => { pos[k] = z(); neg[k] = z(); cnt[k] = z(); });
    const list = [];
    APP.D.catches.filter(c => c.species === p.fish).forEach(c => {
      const s = sim(condOfCatch(c), p); const w = s * s * (RW[c.result] || 0.3) * (/rück/i.test(c.capture || "") ? 0.6 : 1);
      const cls = F.classesOf(c);
      OUT.forEach(([k]) => { if (cls[k] != null) { pos[k][cls[k]] += w; if (s >= 0.5 && c.result === "Gelandet") cnt[k][cls[k]]++; } });
      if (c.result === "Gelandet") list.push({ c, s, cls });
    });
    let att = 0;
    APP.D.sessions.forEach(s => (s.attempts || []).forEach(a => {
      const t = a.text || ""; const g = F.classify({ lure: t, rig: t, color: t });
      const m = t.match(/(\d+(?:[.,]\d)?)\s*(cm|zoll|")/i); const cm = m ? parseFloat(m[1].replace(",", ".")) * (/cm/i.test(m[2]) ? 1 : 2.54) : null;
      const cls = F.classesOf({ lure_type: g.lure_type, lure_action: g.lure_action, color_class: g.color_class, retrieve: t, size: cm ? cm / 2.54 : null });
      const sm = sim(condOfAttempt(s, a), p); const w = 0.4 * sm * sm; att++;
      OUT.forEach(([k]) => { if (cls[k] != null) neg[k][cls[k]] += w; });
    }));
    return { pos, neg, cnt, list: list.sort((a, b) => b.s - a.s), att };
  }

  function predict(p) {
    const sc = {}, why = {};
    OUT.forEach(([k]) => { sc[k] = BASE[p.fish][k].slice(); why[k] = [{}, {}, {}]; });
    const add = (m, label) => { if (!m) return; for (const k in m) m[k].forEach((d, i) => { sc[k][i] += d; if (d > 0) why[k][i][label] = (why[k][i][label] || 0) + d; }); };
    COND.forEach(([ck, , , , rs]) => { const i = p[ck]; add(MOD[ck][i], rs[i]); add(((FMOD[p.fish] || {})[ck] || [])[i], rs[i]); });
    const L = learn(p); const res = {};
    OUT.forEach(([k]) => {
      const rule = sc[k].slice(); const ruleWin = [0, 1, 2].sort((a, b) => rule[b] - rule[a])[0];
      const d = [0, 1, 2].map(i => Math.min(6, 1.5 * L.pos[k][i]) - Math.min(3, L.neg[k][i]));
      const s = rule.map((v, i) => v + d[i]); const ord = [0, 1, 2].sort((a, b) => s[b] - s[a]); const win = ord[0];
      const w = Object.entries(why[k][win]).sort((a, b) => b[1] - a[1]).filter(x => x[1] >= 1).slice(0, 2).map(x => x[0]);
      const n = L.cnt[k][win];
      res[k] = { win, second: ord[1], margin: s[win] - s[ord[1]], scores: s, why: w, learned: win !== ruleWin, ruleWin, n, dWin: d[win] };
    });
    return { res, L };
  }
  function cluster(p) {
    const act = [-1, 0, 1][p.temp] + [1, 0, -1][p.druck] + [0, 0, 1][p.licht]; const a = act <= -1 ? 0 : act >= 1 ? 2 : 1;
    const sicht = p.truebe + [0, 0.5, 1][p.licht]; const v = sicht <= 0.5 ? 0 : sicht <= 1.5 ? 1 : 2;
    const NAMES = [["Fein & langsam", "Langsam am Grund", "Langsam mit Druck"], ["Natürlich absuchen", "Allround", "Auffällig absuchen"], ["Schnell & natürlich", "Aktiv absuchen", "Laut & schnell"]];
    return { label: ["Fisch passiv", "Fisch normal aktiv", "Fisch aktiv"][a] + " · " + ["gute Sicht", "mittlere Sicht", "schlechte Sicht"][v], name: NAMES[a][v] };
  }
  function setupFor(fish, size, art) {
    const map = { Barsch: ["UL", "BF", "W3"], Zander: ["BF", "W3", "GS"], Hecht: ["W3", "TW", "PC"] };
    let code = map[fish][size]; if (art === 1 && size === 1 && fish !== "Hecht") code = "FC";
    const t = F.TACKLE.find(x => x[0] === code); return code + (t ? " – " + t[1].split(" · ").slice(0, 2).join(" · ") : "");
  }

  /* ---------- Zustand ---------- */
  const LSK = "fb.predict.v2";
  let P = null;
  try { const s = JSON.parse(localStorage.getItem(LSK) || "null"); if (s && FISH.includes(s.fish) && COND.every(c => [0, 1, 2].includes(s[c[0]]))) P = s; } catch (e) { }
  if (!P) P = { fish: "Barsch", temp: 1, licht: 1, truebe: 1, druck: 1, wind: 1, tiefe: 0, src: {}, at: 0 };
  P.src = P.src || {};
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify(P)); } catch (e) { } };

  /* ---------- Bedingungen automatisch ---------- */
  function getPos() {
    return new Promise(res => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), () => res(null), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
  }
  async function airMean7(lat, lon) {
    const qs = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), daily: "temperature_2m_mean", past_days: 7, forecast_days: 1, timezone: "auto" });
    const r = await fetch("https://api.open-meteo.com/v1/forecast?" + qs); if (!r.ok) throw new Error();
    const v = ((await r.json()).daily || {}).temperature_2m_mean || []; const x = v.slice(0, 7).filter(n => n != null);
    return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
  }
  let busy = false;
  async function auto(manual) {
    if (busy) return; if (!manual && Date.now() - (P.at || 0) < 10 * 60e3) return render();
    busy = true; $("btnAuto").disabled = true; $("autoMsg").textContent = "Hole Standort und Wetter …";
    const D = APP.D, notes = [];
    const act = D.sessions.find(s => s.live && s.date && !s.end_time);
    let pos = await getPos();
    if (pos) notes.push(`Standort per GPS (±${pos.acc} m)`);
    else {
      const sp = act ? spotOf((act.spots || [])[0]) : null;
      const lastC = D.catches.filter(c => c.date).sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))[0];
      const ref = sp || (lastC && spotOf(lastC.spot)) || D.spots[0];
      if (ref) { pos = { lat: ref.lat, lon: ref.lon }; notes.push(`kein GPS – nehme Spot ${ref.id}`); }
    }
    const src = {};
    if (pos) {
      // Tiefe vom nächsten bekannten Spot
      const n = F.nearestSpot(D.spots, pos);
      if (n && n.d <= 500 && n.spot.depth != null) { P.tiefe = dcls(n.spot.depth); src.tiefe = `Spot ${n.spot.id}, ${fmt(n.spot.depth)} m`; }
      // Licht: Uhrzeit, sonst Bewölkung
      const ph = F.lightPhase(F.nowHM(), F.sunTimes(pos.lat, pos.lon, F.todayISO()));
      let w = null;
      if (navigator.onLine) { try { w = await F.fetchWeather(pos.lat, pos.lon, F.todayISO(), F.nowHM()); } catch (e) { w = null; } }
      if (!w && act && act.weather && act.date === F.todayISO()) w = act.weather;
      if (isDusk(ph)) { P.licht = 2; src.licht = ph; }
      else if (w && w.cloud_cover != null) { P.licht = lcls(ph, w.cloud_cover, w.weather_code); src.licht = `${Math.round(w.cloud_cover)} % Wolken`; }
      if (w) {
        const pc = pcls(w.pressure_trend); if (pc != null) { P.druck = pc; src.druck = (w.pressure_trend || "").split(" (")[0] + (w.pressure ? `, ${Math.round(w.pressure)} hPa` : ""); }
        if (w.wind_speed != null) { P.wind = wcls(w.wind_speed); src.wind = `${Math.round(w.wind_speed)} km/h`; }
      } else notes.push("Wetter gerade nicht abrufbar");
      // Wassertemperatur: Messung der letzten 7 Tage, sonst Schätzung aus der Lufttemperatur
      const wt = D.catches.filter(c => c.water_temp != null && c.date).sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")))[0];
      if (wt && (Date.now() - new Date(wt.date + "T12:00:00")) / 864e5 <= 7) { P.temp = tcls(wt.water_temp); src.temp = `gemessen ${fmt(wt.water_temp)} °C am ${dDE(wt.date)}`; }
      else if (navigator.onLine) { try { const m = await airMean7(pos.lat, pos.lon); if (m != null) { P.temp = tcls(m); src.temp = `geschätzt ca. ${fmt(m, 0)} °C`; } } catch (e) { } }
      // Trübung: heute schon eingetragen?
      const cl = D.catches.filter(c => c.clarity && c.date === F.todayISO()).sort((a, b) => (b.time || "").localeCompare(a.time || ""))[0];
      if (cl) { P.truebe = F.CLARITY.indexOf(cl.clarity); src.truebe = "heute eingetragen"; }
    } else notes.push("kein Standort verfügbar");
    P.src = src; P.at = Date.now(); save();
    $("autoMsg").textContent = (notes.length ? notes.join(" · ") + ". " : "") + (src.truebe ? "" : "Trübung bitte prüfen. ") + "Passt etwas nicht, tipp einfach um.";
    busy = false; $("btnAuto").disabled = false; render();
  }

  /* ---------- Oberfläche ---------- */
  function build() {
    $("pc-fish").innerHTML = FISH.map(f => `<button data-pk="fish" data-pv="${f}">${f}</button>`).join("");
    $("pcGrid").innerHTML = COND.map(([k, t, h, o]) => `<div class="cond"><span class="lbl">${t}${h ? ` <span class="rng">(${h})</span>` : ""}<span class="src" id="src-${k}"></span></span><div class="seg full" role="group" aria-label="${t}">${o.map((x, i) => `<button data-pk="${k}" data-pv="${i}">${x}</button>`).join("")}</div></div>`).join("");
    document.querySelectorAll("#v-vorh [data-pk]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.pk; if (k === "fish") P.fish = b.dataset.pv; else { P[k] = +b.dataset.pv; P.src[k] = "von dir"; } save(); render();
    }));
  }
  function render() {
    document.querySelectorAll("#v-vorh [data-pk]").forEach(b => b.setAttribute("aria-pressed", String(P[b.dataset.pk]) === b.dataset.pv));
    COND.forEach(([k]) => { const s = P.src[k]; $("src-" + k).textContent = s ? " · " + (s === "von dir" ? "von dir" : "auto: " + s) : ""; $("src-" + k).classList.toggle("own", s === "von dir"); });
    const { res: r, L } = predict(P), c = cluster(P);
    const art = r.art.win, akt = r.akt.win, size = r.size.win, farbe = r.farbe.win, fuehr = r.fuehr.win;
    const klasse = [OUT[0][2][art], OUT[1][2][akt], OUT[2][2][size], OUT[3][2][farbe], OUT[4][2][fuehr]].join(" · ");
    const nFish = L.list.length, nSim = L.list.filter(x => x.s >= 0.5).length;
    const rows = OUT.map(([k, t, o]) => {
      const x = r[k]; const mx = Math.max(...x.scores), mn = Math.min(...x.scores);
      const extra = k === "fuehr" ? FT[fuehr][art] + " · " : k === "farbe" ? FARB[farbe] + " · " : "";
      const own = x.n ? `bestätigt durch ${x.n} ähnliche${x.n === 1 ? "n" : ""} Fang${x.n === 1 ? "" : "e"} von dir · ` : "";
      return `<div class="out"><div class="hint">${t}</div><div>
        <div class="win">${o[x.win]}${k === "size" ? ` <span class="hint" style="display:inline">(${SIZE_TXT[x.win]})</span>` : ""}${x.learned ? ` <span class="chip good">gelernt</span>` : ""}${x.margin < 1 ? ` <span class="chip warn">knapp vor ${o[x.second]}</span>` : ""}</div>
        <div class="mini">${x.scores.map((s, i) => `<span class="${i === x.win ? "w" : ""}"><i style="width:${Math.max(6, (s - mn) / ((mx - mn) || 1) * 100)}%"></i></span>`).join("")}</div>
        <div class="mini-l">${o.map(n => `<span>${n}</span>`).join("")}</div>
        <p class="hint">${esc(extra)}${esc(own)}${x.why.length ? "wegen " + esc(x.why.join(" und ")) : x.n ? "" : "typisch für " + P.fish}${x.learned ? ` · Regeln allein: ${esc(o[x.ruleWin])}` : ""}</p></div></div>`;
    }).join("");
    $("predOut").innerHTML = `<div class="chips"><span class="chip good">Cluster: ${esc(c.name)}</span><span class="chip">${esc(c.label)}</span><span class="chip">${nFish ? `lernt aus ${nFish} ${P.fish}-Fängen, ${nSim} ähnlich` : "noch keine eigenen Fänge"}</span></div>
      <div class="klasse">${esc(klasse)}</div>
      <p style="margin:0"><b>Konkret:</b> ${esc(EX[art + "|" + akt])}, ${SIZE_TXT[size]}, ${esc(FARB[farbe].split(" – ")[0])}.<br><span class="hint">Setup z. B. ${esc(setupFor(P.fish, size, art))}</span></p>
      <div>${rows}</div>`;
    $("predData").innerHTML = mine(L);
  }
  function mine(L) {
    if (!L.list.length) return `<p class="hint">Noch keine ${P.fish}-Fänge im Fangbuch. Die Vorhersage nutzt deshalb nur die Grundregeln. Jeder gemeldete Fang fließt ab sofort mit ein – je ähnlicher die Bedingungen, desto stärker.</p>`;
    const top = L.list.slice(0, 4);
    const lab = (i, arr) => i == null ? null : arr[i];
    return `<p class="hint">Deine ${P.fish}-Fänge, die den heutigen Bedingungen am nächsten kommen:</p>
      <ul class="fl">${top.map(({ c, s, cls }) => `<li class="${c.cm > 25 ? "big" : ""}"><b>${c.cm} cm</b> · ${dDE(c.date)} · ${Math.round(s * 100)} % ähnlich<small>${esc([c.lure, c.size ? c.size + '"' : "", c.color].filter(Boolean).join(" · "))}</small><small>${esc([lab(cls.art, F.LURE_TYPES), lab(cls.akt, F.LURE_ACTIONS), lab(cls.farbe, F.COLOR_CLASSES), lab(cls.fuehr, ["langsam", "schnell", "aggressiv"])].filter(Boolean).join(" · ") || "Köderklassen unbekannt")}</small></li>`).join("")}</ul>
      ${L.att ? `<p class="hint">${L.att} Köder ohne Biss fließen als Abzug ein.</p>` : ""}
      <p class="hint">Tipp: Beim Melden Köderart, Ködertyp, Farbklasse und Trübung prüfen – dann lernt die Vorhersage genauer.</p>`;
  }

  build();
  $("btnAuto").addEventListener("click", () => auto(true));
  document.querySelectorAll('.tabbar button[data-v="vorh"]').forEach(b => b.addEventListener("click", () => auto(false)));
  render();
  window.FBPRED = { predict: p => predict(p || P), P: () => P };
})();
