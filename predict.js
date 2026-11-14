/* Fangbuch – Vorhersage: Köderart, Ködertyp, Größe, Farbe und Führung je Zielfisch aus den Bedingungen.
   Regelmodell: Grundvorliebe je Fisch + Zu-/Abschläge je Bedingung; Cluster aus Aktivität und Sicht. */
(function () {
  "use strict";
  const F = window.FB, APP = window.FBAPP;
  if (!F || !APP) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v, d = 1) => v == null || isNaN(v) ? "–" : Number(v).toFixed(d).replace(".", ",");
  const dDE = iso => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : "–";

  const FISH = ["Barsch", "Zander", "Hecht"];
  const OUT = [["art", "Köderart", ["Softbait", "Hardbait", "Metallköder"]], ["akt", "Ködertyp", ["Action", "No Action", "Druckwelle"]],
    ["size", "Ködergröße", ["klein", "mittel", "groß"]], ["farbe", "Farbe", ["natürlich", "dunkel", "auffällig"]], ["fuehr", "Führung", ["langsam", "schnell", "aggressiv"]]];
  const SIZE_TXT = ["bis 7 cm", "7–12 cm", "über 12 cm"];
  const COND = [
    ["temp", "Wassertemperatur", "kalt < 8 °C · warm > 16 °C", ["kalt", "mittel", "warm"], ["kaltem Wasser", "mittlerer Wassertemperatur", "warmem Wasser"]],
    ["licht", "Licht", "Dämmerung gilt auch nachts", ["sonnig", "bedeckt", "Dämmerung"], ["viel Licht", "bedecktem Himmel", "Dämmerung"]],
    ["truebe", "Wasser", "", ["klar", "leicht trüb", "trüb"], ["klarem Wasser", "leicht trübem Wasser", "trübem Wasser"]],
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
  const tcls = t => t < 8 ? 0 : t <= 16 ? 1 : 2;

  const LSK = "fb.predict.v1";
  let P = null, stored = false, autoDone = false;
  try { const s = JSON.parse(localStorage.getItem(LSK) || "null"); if (s && FISH.includes(s.fish) && COND.every(c => [0, 1, 2].includes(s[c[0]]))) { P = s; stored = true; } } catch (e) { }
  if (!P) P = { fish: "Barsch", temp: 1, licht: 1, truebe: 1, druck: 1, wind: 1, tiefe: 0 };
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify(P)); } catch (e) { } };

  function predict(p) {
    const sc = {}, why = {};
    OUT.forEach(([k]) => { sc[k] = BASE[p.fish][k].slice(); why[k] = [{}, {}, {}]; });
    const add = (m, label) => { if (!m) return; for (const k in m) m[k].forEach((d, i) => { sc[k][i] += d; if (d > 0) why[k][i][label] = (why[k][i][label] || 0) + d; }); };
    COND.forEach(([ck, , , , rs]) => { const i = p[ck]; add(MOD[ck][i], rs[i]); add(((FMOD[p.fish] || {})[ck] || [])[i], rs[i]); });
    const res = {};
    OUT.forEach(([k]) => {
      const s = sc[k]; const ord = [0, 1, 2].sort((a, b) => s[b] - s[a]);
      const w = Object.entries(why[k][ord[0]]).sort((a, b) => b[1] - a[1]).filter(x => x[1] >= 1).slice(0, 2).map(x => x[0]);
      res[k] = { win: ord[0], second: ord[1], margin: s[ord[0]] - s[ord[1]], scores: s, why: w };
    });
    return res;
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

  /* ---------- Oberfläche ---------- */
  function build() {
    $("pc-fish").innerHTML = FISH.map(f => `<button data-pk="fish" data-pv="${f}">${f}</button>`).join("");
    $("pcGrid").innerHTML = COND.map(([k, t, h, o]) => `<div class="cond"><span class="lbl">${t}${h ? " · " + h : ""}</span><div class="seg full" role="group" aria-label="${t}">${o.map((x, i) => `<button data-pk="${k}" data-pv="${i}">${x}</button>`).join("")}</div></div>`).join("");
    document.querySelectorAll("#v-vorh [data-pk]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.pk; P[k] = k === "fish" ? b.dataset.pv : +b.dataset.pv; save(); render();
    }));
  }

  /* Bedingungen automatisch: Wetter der laufenden Session oder live abrufen, Licht aus Uhrzeit, Tiefe vom Spot, Wassertemperatur vom letzten Eintrag */
  async function auto(manual) {
    const D = APP.D, msgs = [];
    const a = D.sessions.find(s => s.live && s.date && !s.end_time);
    const sp = a ? D.spots.find(s => s.id === (a.spots || [])[0]) : null;
    const lastC = D.catches.filter(c => c.date).sort((x, y) => (y.date + (y.time || "")).localeCompare(x.date + (x.time || "")))[0];
    const ref = sp || (lastC && D.spots.find(s => s.id === lastC.spot)) || D.spots[0];
    // Wassertemperatur
    const wt = D.catches.filter(c => c.water_temp != null && c.date).sort((x, y) => (y.date + (y.time || "")).localeCompare(x.date + (x.time || "")))[0];
    if (wt && (Date.now() - new Date(wt.date + "T12:00:00")) / 864e5 <= 14) { P.temp = tcls(wt.water_temp); msgs.push(`Wasser ${fmt(wt.water_temp)} °C vom ${dDE(wt.date)}`); }
    // Tiefe
    if (ref && ref.depth != null) { P.tiefe = ref.depth < 2 ? 0 : ref.depth <= 5 ? 1 : 2; msgs.push(`Tiefe ${fmt(ref.depth)} m (${ref.id})`); }
    // Licht nach Uhrzeit
    let dusk = false;
    if (ref && ref.lat != null) {
      const ph = F.lightPhase(F.nowHM(), F.sunTimes(ref.lat, ref.lon, F.todayISO()));
      dusk = /dämmerung|nacht|1\. stunde/i.test(ph);
    }
    // Wetter
    let w = a && a.weather && a.date === F.todayISO() ? a.weather : null;
    if (!w && manual && ref && ref.lat != null && navigator.onLine) {
      try { w = await F.fetchWeather(ref.lat, ref.lon, F.todayISO(), F.nowHM()); } catch (e) { w = null; }
    }
    if (dusk) { P.licht = 2; msgs.push("Dämmerung/Nacht nach Uhrzeit"); }
    else if (w && w.cloud_cover != null) { P.licht = w.cloud_cover >= 60 || (w.weather_code != null && w.weather_code >= 45) ? 1 : 0; msgs.push(`Bewölkung ${Math.round(w.cloud_cover)} %`); }
    else if (P.licht === 2) P.licht = 1;
    if (w) {
      const tr = (w.pressure_trend || "").split(" (")[0];
      if (tr) { P.druck = /fallend/.test(tr) ? 0 : /steigend/.test(tr) ? 2 : 1; msgs.push(`Luftdruck ${tr}`); }
      if (w.wind_speed != null) { P.wind = w.wind_speed < 8 ? 0 : w.wind_speed <= 25 ? 1 : 2; msgs.push(`Wind ${Math.round(w.wind_speed)} km/h`); }
    }
    save();
    $("autoMsg").textContent = msgs.length ? "Übernommen: " + msgs.join(" · ") + ". Trübung bitte selbst wählen." : (manual ? "Keine aktuellen Werte gefunden. Bitte selbst antippen." : $("autoMsg").textContent);
    render();
  }

  function render() {
    if (!autoDone && !stored) { autoDone = true; auto(false); return; }
    document.querySelectorAll("#v-vorh [data-pk]").forEach(b => b.setAttribute("aria-pressed", String(P[b.dataset.pk]) === b.dataset.pv));
    const r = predict(P), c = cluster(P);
    const art = r.art.win, akt = r.akt.win, size = r.size.win, farbe = r.farbe.win, fuehr = r.fuehr.win;
    const klasse = [OUT[0][2][art], OUT[1][2][akt], OUT[2][2][size], OUT[3][2][farbe], OUT[4][2][fuehr]].join(" · ");
    const rows = OUT.map(([k, t, o]) => {
      const x = r[k]; const mx = Math.max(...x.scores), mn = Math.min(...x.scores);
      const extra = k === "fuehr" ? FT[fuehr][art] + " · " : k === "farbe" ? FARB[farbe] + " · " : "";
      return `<div class="out"><div class="hint">${t}</div><div>
        <div class="win">${o[x.win]}${k === "size" ? ` <span class="hint" style="display:inline">(${SIZE_TXT[x.win]})</span>` : ""}${x.margin < 1 ? ` <span class="chip warn">knapp vor ${o[x.second]}</span>` : ""}</div>
        <div class="mini">${x.scores.map((s, i) => `<span class="${i === x.win ? "w" : ""}"><i style="width:${Math.max(6, (s - mn) / ((mx - mn) || 1) * 100)}%"></i></span>`).join("")}</div>
        <div class="mini-l">${o.map(n => `<span>${n}</span>`).join("")}</div>
        <p class="hint">${esc(extra)}${x.why.length ? "wegen " + esc(x.why.join(" und ")) : "typisch für " + P.fish}</p></div></div>`;
    }).join("");
    $("predOut").innerHTML = `<div class="chips"><span class="chip good">Cluster: ${esc(c.name)}</span><span class="chip">${esc(c.label)}</span></div>
      <div class="klasse">${esc(klasse)}</div>
      <p style="margin:0"><b>Konkret:</b> ${esc(EX[art + "|" + akt])}, ${SIZE_TXT[size]}, ${esc(FARB[farbe].split(" – ")[0])}.<br><span class="hint">Setup z. B. ${esc(setupFor(P.fish, size, art))}</span></p>
      <div>${rows}</div>`;
    $("predData").innerHTML = mine(r);
  }

  function mine(r) {
    const fs = APP.D.catches.filter(c => c.result === "Gelandet" && c.species === P.fish);
    if (!fs.length) return `<p class="hint">Noch keine ${P.fish}-Fänge im Fangbuch. Die Vorhersage stützt sich deshalb nur auf allgemeine Erfahrungswerte. Mit jedem gemeldeten Fang siehst du hier, was bei dir wirklich funktioniert.</p>`;
    const same = fs.filter(c => c.water_temp != null && tcls(c.water_temp) === P.temp); const pool = same.length ? same : fs;
    const cnt = {}; pool.forEach(c => { const k = [c.lure || "ohne Köderangabe", c.color].filter(Boolean).join(" · "); (cnt[k] = cnt[k] || []).push(c.cm || 0); });
    const top = Object.entries(cnt).sort((a, b) => b[1].length - a[1].length || Math.max(...b[1]) - Math.max(...a[1])).slice(0, 3);
    const sz = [0, 0, 0]; let szn = 0; pool.forEach(c => { if (c.size) { const cm = c.size * 2.54; sz[cm <= 7 ? 0 : cm <= 12 ? 1 : 2]++; szn++; } });
    const dom = szn ? sz.indexOf(Math.max(...sz)) : null;
    const noTemp = fs.filter(c => c.water_temp == null).length;
    return `<div class="chips"><span class="chip good">${fs.length} ${P.fish} gefangen</span><span class="chip">${same.length} bei ${COND[0][4][P.temp]}</span>${noTemp ? `<span class="chip">${noTemp} ohne Wassertemperatur</span>` : ""}</div>
      <p class="hint">${same.length ? "Am fängigsten bei dieser Wassertemperatur:" : "Bei dieser Wassertemperatur noch kein Fang erfasst – am fängigsten insgesamt:"}</p>
      <ul class="fl">${top.map(([l, a]) => `<li><b>${esc(l)}</b> · ${a.length}×<small>Ø ${fmt(a.reduce((x, y) => x + y, 0) / a.length)} cm · max ${Math.max(...a)} cm</small></li>`).join("")}</ul>
      ${szn ? `<p class="hint">Ködergröße dieser Fänge: ${sz[0]}× klein · ${sz[1]}× mittel · ${sz[2]}× groß. ${dom === r.size.win ? "Passt zur Vorhersage." : "Deine Fänge sprechen eher für " + OUT[2][2][dom] + " – teste beides."}</p>` : ""}`;
  }

  build();
  $("btnAuto").addEventListener("click", async () => { const b = $("btnAuto"); b.disabled = true; $("autoMsg").textContent = "Hole aktuelle Werte …"; await auto(true); b.disabled = false; });
  document.querySelectorAll('.tabbar button[data-v="vorh"]').forEach(b => b.addEventListener("click", render));
  render();
})();
