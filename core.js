/* Fangbuch – reine Logik ohne Oberfläche: Tackle, Sonne/Mond, Distanz, Sprach-Parser, Wetter, Statistik */
(function (G) {
  "use strict";

  const TACKLE = [
    ["UL", "Daiwa Trout Area Commander 2,00 m 1–7 g · Ninja 1003 · Tournament 0,08 pink · FC 0,185"],
    ["BF", "Daiwa Powermesh 2,10 m 5–14 g · T3 1016SHL-TW · J-Braid 0,13 gelb"],
    ["TW", "Daiwa Twitchin Stick 1,98 m 7–28 g · T3 Ballistic 100 HSL · J-Braid 0,13 chartreuse"],
    ["W3", "Westin W3 Ultra Stick 2nd Gen 2,13 m 7–28 g · Fuego 2500 XCH · J-Braid 0,13 chartreuse"],
    ["FC", "Westin W3 Finesse Crank T 2,13 m 10–30 g · Prorex 100 HSL · J-Braid 0,13 chartreuse"],
    ["PC", "Westin W6 Powercast 2,36 m 40–130 g · Tatula 200 HSL · Sig Braid 0,23 gelb"],
    ["GS", "Sportex 2,40 m bis 49 g · Prorex 3000 XCH · J-Braid 0,13 gelb"],
    ["CC", "Daiwa Crazy Cranker 2,10 m 15–40 g (ohne Rolle)"],
    ["MF1", "Sea Trout 3,10 m 16–37 g · Ninja 3000 XCH · Suffix 0,16 schwarz"],
    ["MF2", "Westin W4 Spin 3,15 m 7–30 g · Caldia 3000 XCH · J-Braid 0,13 grau"]
  ];

  const pad = n => String(n).padStart(2, "0");
  const todayISO = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const nowHM = (d = new Date()) => pad(d.getHours()) + ":" + pad(d.getMinutes());
  const hm2m = t => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const m2hm = m => m == null ? "" : pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ":" + pad(Math.round(((m % 60) + 60) % 60) % 60);

  /* ---- Sonne (NOAA-Näherung), Zeiten in lokaler Zeit des Geräts ---- */
  function sunTimes(lat, lon, iso) {
    const d = new Date(iso + "T12:00:00");
    const start = new Date(d.getFullYear(), 0, 1, 12);
    const n = Math.round((d - start) / 864e5) + 1;
    const g = 2 * Math.PI / 365 * (n - 1 + 0.5);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const off = -d.getTimezoneOffset();
    const r = Math.PI / 180;
    const ev = (z, rise) => {
      const c = Math.cos(z * r) / (Math.cos(lat * r) * Math.cos(dec)) - Math.tan(lat * r) * Math.tan(dec);
      if (c < -1 || c > 1) return null;
      const ha = Math.acos(c) / r;
      return 720 - 4 * (lon + (rise ? ha : -ha)) - eq + off;
    };
    return { sr: ev(90.833, true), su: ev(90.833, false), civ: ev(96, false), nau: ev(102, false), dawn: ev(96, true) };
  }
  function lightPhase(t, st) {
    const x = hm2m(t); if (x == null || !st || st.su == null) return "";
    if (st.dawn != null && x < st.dawn) return "Nacht";
    if (st.sr != null && x < st.sr) return "Morgendämmerung";
    if (st.sr != null && x - st.sr <= 60) return "Morgens (1. Stunde)";
    if (x <= st.su) return st.su - x <= 60 ? "Abenddämmerung (bis SU)" : (x >= 720 ? "Nachmittag" : "Vormittag");
    if (x <= st.civ) return "Bürgerl. Dämmerung (nach SU)";
    if (x <= st.nau) return "Nautische Dämmerung";
    return "Nacht";
  }
  function moon(iso, t) {
    const ref = Date.UTC(2026, 10, 9, 7, 2), P = 29.530588853;
    const ms = new Date(iso + "T" + (t || "12:00") + ":00").getTime();
    let age = ((ms - ref) / 864e5) % P; if (age < 0) age += P;
    const ill = Math.round((1 - Math.cos(2 * Math.PI * age / P)) / 2 * 100);
    const names = [[1.0, "Neumond"], [6.4, "Zunehmende Sichel"], [8.4, "Erstes Viertel"], [13.8, "Zunehmend"], [15.8, "Vollmond"], [21.1, "Abnehmend"], [23.1, "Letztes Viertel"], [28.5, "Abnehmende Sichel"], [30, "Neumond"]];
    return { name: names.find(a => age < a[0])[1], ill, age: Math.round(age * 10) / 10 };
  }

  /* ---- Distanz ---- */
  function dist(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function nearestSpot(spots, p) {
    let best = null;
    spots.forEach(s => { if (s.lat == null) return; const d = dist(s, p); if (!best || d < best.d) best = { spot: s, d }; });
    return best;
  }

  /* ---- Sprach-Parser (deutsch, tolerant gegenüber Spracherkennung) ---- */
  const ALIASES = [[/\bdiver\b|\bdaiva\b|\bdeiwa\b/g, "daiwa"], [/\bweston\b/g, "westin"], [/\bkitec\b|\bkaitech\b|\bkeytech\b/g, "keitech"],
    [/\broute\b/g, "rute"], [/\bdickkopf\b|\bjig ?kopf\b/g, "jigkopf"], [/\besche\b/g, "äsche"], [/\bdeepfin\b|\bdee fin\b/g, "d-fin"],
    [/\bikyro\b|\bikiro\b/g, "ikiru"], [/\bskinny cake\b/g, "skinny kick"], [/\bstanley stickleback\b/g, "stanley the stickleback"]];
  const SPECIES = [["flussbarsch", "Barsch"], ["barsch", "Barsch"], ["zander", "Zander"], ["hecht", "Hecht"], ["döbel", "Döbel"], ["doebel", "Döbel"],
    ["äsche", "Äsche"], ["meerforelle", "Meerforelle"], ["bachforelle", "Forelle"], ["regenbogenforelle", "Forelle"], ["forelle", "Forelle"], ["rapfen", "Rapfen"],
    ["aland", "Aland"], ["brasse", "Brasse"], ["rotauge", "Rotauge"], ["karpfen", "Karpfen"], ["wels", "Wels"], ["dorsch", "Dorsch"], ["hornhecht", "Hornhecht"]];
  const LURES = [["keitech easy shiner", "Keitech Easy Shiner"], ["easy shiner", "Keitech Easy Shiner"], ["d-fin", "Daiwa D-Fin"], ["skinny kick", "Daiwa Skinny Kick"],
    ["stanley the stickleback", "Westin Stanley the Stickleback"], ["stickleback", "Westin Stanley the Stickleback"], ["ikiru", "Spro Ikiru"],
    ["fox rage", "Fox Rage"], ["quantum", "Quantum"], ["chatterbait", "Chatterbait"], ["chatter", "Chatterbait"], ["krebs", "Krebsimitat"],
    ["twitchbait", "Twitchbait"], ["wobbler", "Wobbler"], ["spinner", "Spinner"], ["blinker", "Blinker"], ["gummifisch", "Gummifisch"]];
  const COLORS = ["golden shiner", "firetiger", "motoroil", "motor oil", "roach", "chartreuse", "weiß-glitter", "braun-weiß", "braun-blau", "dunkelbraun", "hellbraun",
    "braun", "weiß", "weiss", "schwarz", "grün", "pink", "rot", "blau", "gelb", "silber", "gold", "natur", "uv", "glitter"];
  const num = s => s == null ? null : parseFloat(String(s).replace(",", "."));

  function parse(text) {
    let t = " " + String(text || "").toLowerCase() + " ";
    ALIASES.forEach(([re, v]) => { t = t.replace(re, v); });
    const out = {};
    if (/fehlbiss|nicht gehakt|verpasst/.test(t)) out.result = "Fehlbiss";
    else if (/ausgestiegen|verloren|abgerissen beim drill/.test(t)) out.result = "Ausgestiegen";
    else if (/nachläufer|verfolger/.test(t)) out.result = "Nachläufer";
    for (const [k, v] of SPECIES) { if (t.includes(k)) { out.species = v; break; } }
    // Länge des Fisches: Zahl + cm, die nicht direkt zu einem Köder gehört (erste Angabe nach Fischart bevorzugt)
    const cmAll = [...t.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*(?:cm|zentimeter)\b/g)];
    if (cmAll.length && !out.species) {
      out.size = Math.round(num(cmAll[0][1]) / 2.54 * 10) / 10;
    } else if (cmAll.length) {
      const sp = out.species ? t.indexOf(out.species.toLowerCase()) : -1;
      const pick = cmAll.find(m => sp >= 0 && m.index > sp && m.index - sp < 25) || cmAll.find(m => +num(m[1]) >= 8) || cmAll[0];
      out.cm = num(pick[1]);
      const rest = cmAll.filter(m => m !== pick);
      if (rest.length && !/zoll|inch/.test(t)) out.size = Math.round(num(rest[0][1]) / 2.54 * 10) / 10;
    }
    const inch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:zoll|inch|")/);
    if (inch) out.size = num(inch[1]);
    const g = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramm)\b/);
    if (g) out.weight = num(g[1]);
    const wt = t.match(/wasser\w*\s*(?:temperatur\s*)?(?:von\s*|ist\s*|hat\s*|bei\s*)?(\d{1,2}(?:[.,]\d)?)\s*(?:grad|°)/) || t.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:grad|°)\s*wasser/);
    if (wt) out.waterTemp = num(wt[1]);
    const code = t.match(/\b(ul|bf|tw|w3|fc|pc|gs|cc|mf1|mf2)\b/);
    if (code) out.setup = code[1].toUpperCase();
    else if (/ultra ?leicht|trout area/.test(t)) out.setup = "UL";
    else if (/powermesh|baitcast/.test(t)) out.setup = "BF";
    else if (/twitchin stick/.test(t)) out.setup = "TW";
    else if (/finesse crank/.test(t)) out.setup = "FC";
    else if (/powercast/.test(t)) out.setup = "PC";
    if (/drop ?shot/.test(t)) out.rig = "Drop-Shot";
    else if (/texas/.test(t)) out.rig = "Texas-Rig";
    else if (/carolina/.test(t)) out.rig = "Carolina-Rig";
    else if (/ned ?rig/.test(t)) out.rig = "Ned-Rig";
    else if (/free ?rig/.test(t)) out.rig = "Free-Rig";
    else if (/chatter/.test(t)) out.rig = "Chatterbait";
    else if (/jigkopf|\bjig\b/.test(t)) out.rig = "Jigkopf";
    else if (/wobbler|twitchbait|crank|shortlip/.test(t)) out.rig = "Hardbait";
    for (const [k, v] of LURES) { if (t.includes(k)) { out.lure = v; break; } }
    if (out.lure === "Spro Ikiru") { const m = t.match(/ikiru\s*(\d{2,3})\s*(shortlip|short lip)?/); if (m) out.lure = "Spro Ikiru " + m[1] + (m[2] ? " Shortlip" : ""); }
    for (const c of COLORS) { if (t.includes(c)) { out.color = c.replace("weiss", "weiß").replace(/^./, x => x.toUpperCase()); break; } }
    if (/sehr langsam|extrem langsam|ganz langsam/.test(t)) out.tempo = "1 sehr langsam";
    else if (/sehr schnell|extrem schnell/.test(t)) out.tempo = "5 sehr schnell";
    else if (/langsam/.test(t)) out.tempo = "2 langsam";
    else if (/schnell/.test(t)) out.tempo = "4 schnell";
    else if (/mittel/.test(t)) out.tempo = "3 mittel";
    const rets = [["faulenz", "Faulenzen"], ["jiggen", "Jiggen"], ["twitch", "Twitchen"], ["jerk", "Jerken"], ["schleif", "Schleifen"], ["einkurbel", "Monoton einkurbeln"], ["dead ?stick", "Dead-Stick"], ["stopp|stop and go|stop & go", "Kurbeln + Stopps"]];
    for (const [k, v] of rets) { if (new RegExp(k).test(t)) { out.retrieve = v; break; } }
    const bites = [["absinkphase|absinken|beim absinken", "In der Absinkphase"], ["herausheben|rausheben|vor den füßen|am ufer", "Kurz vor dem Herausheben"], ["zaghaft|zupfer|vorsichtig", "Zaghaft"], ["einschlag|hart", "Harter Einschlag"]];
    for (const [k, v] of bites) { if (new RegExp(k).test(t)) { out.bite = v; break; } }
    if (/zurückgesetzt|released|release|schwimmen lassen/.test(t)) out.release = "Zurückgesetzt";
    else if (/entnommen|mitgenommen|behalten/.test(t)) out.release = "Entnommen";
    const time = t.match(/\bum\s*(\d{1,2})[:.](\d{2})\b/);
    if (time) out.time = pad(+time[1]) + ":" + time[2];
    return out;
  }

  /* ---- Wetter: Open-Meteo (frei, ohne Schlüssel) ---- */
  const HOURLY = "temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m";
  function compass(deg) { if (deg == null) return ""; return ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8]; }
  function wmo(c) {
    if (c == null) return ""; if (c === 0) return "klar"; if (c <= 2) return "heiter"; if (c === 3) return "bedeckt"; if (c <= 48) return "Nebel";
    if (c <= 57) return "Niesel"; if (c <= 67) return "Regen"; if (c <= 77) return "Schnee"; if (c <= 82) return "Schauer"; if (c <= 86) return "Schneeschauer"; return "Gewitter";
  }
  function trendText(d3) {
    if (d3 == null) return "";
    if (d3 <= -3) return "stark fallend"; if (d3 <= -1) return "fallend"; if (d3 < 1) return "stabil"; if (d3 < 3) return "steigend"; return "stark steigend";
  }
  function addDays(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return todayISO(d); }
  async function fetchWeather(lat, lon, date, time) {
    const today = todayISO();
    const base = date >= addDays(today, -3) ? "https://api.open-meteo.com/v1/forecast" : "https://historical-forecast-api.open-meteo.com/v1/forecast";
    const qs = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: HOURLY, timezone: "auto", start_date: addDays(date, -1), end_date: date, wind_speed_unit: "kmh" });
    const res = await fetch(base + "?" + qs.toString());
    if (!res.ok) throw new Error("Wetterdienst antwortet nicht (" + res.status + ")");
    const j = await res.json(); const H = j.hourly; if (!H || !H.time) throw new Error("Keine Wetterdaten");
    const m = hm2m(time || "12:00"); const hh = pad(Math.min(23, Math.round(m / 60)));
    let i = H.time.indexOf(date + "T" + hh + ":00"); if (i < 0) i = H.time.length - 1;
    const pick = k => H[k] ? H[k][i] : null;
    const p = pick("pressure_msl"); const p3 = i >= 3 ? H.pressure_msl[i - 3] : null; const p24 = i >= 24 ? H.pressure_msl[i - 24] : null;
    const d3 = p != null && p3 != null ? Math.round((p - p3) * 10) / 10 : null;
    const d24 = p != null && p24 != null ? Math.round((p - p24) * 10) / 10 : null;
    return {
      air_temp: pick("temperature_2m"), humidity: pick("relative_humidity_2m"), precip: pick("precipitation"), weather_code: pick("weather_code"),
      cloud_cover: pick("cloud_cover"), pressure: p != null ? Math.round(p * 10) / 10 : null, wind_speed: pick("wind_speed_10m"), wind_dir: pick("wind_direction_10m"), wind_gust: pick("wind_gusts_10m"),
      pressure_trend: d3 == null ? "" : `${trendText(d3)} (${d3 > 0 ? "+" : ""}${String(d3).replace(".", ",")} hPa/3 h${d24 != null ? `, ${d24 > 0 ? "+" : ""}${String(d24).replace(".", ",")} hPa/24 h` : ""})`,
      weather_status: "erfasst", weather_src: "Open-Meteo " + date + " " + hh + ":00"
    };
  }
  function wxSummary(w) {
    if (!w || w.air_temp == null) return "";
    return `${String(Math.round(w.air_temp * 10) / 10).replace(".", ",")} °C · ${w.pressure ?? "–"} hPa ${w.pressure_trend ? "(" + w.pressure_trend.split(" (")[0] + ")" : ""} · ${compass(w.wind_dir)} ${Math.round(w.wind_speed ?? 0)} km/h · ${wmo(w.weather_code)}`;
  }

  /* ---- Statistik ---- */
  function groupStats(catches, keyFn) {
    const g = {};
    catches.forEach(c => {
      const k = keyFn(c) || "–"; const o = g[k] || (g[k] = { key: k, bites: 0, fish: 0, sum: 0, max: 0 });
      o.bites++; if (c.result === "Gelandet") { o.fish++; o.sum += c.cm || 0; o.max = Math.max(o.max, c.cm || 0); }
    });
    return Object.values(g).map(o => ({ ...o, avg: o.fish ? o.sum / o.fish : null })).sort((a, b) => b.fish - a.fish || (b.avg || 0) - (a.avg || 0));
  }
  function durH(s) { const a = hm2m(s.start_time), b = hm2m(s.end_time); if (a == null || b == null) return null; let m = b - a; if (m < 0) m += 1440; return m / 60; }

  G.FB = { TACKLE, pad, todayISO, nowHM, hm2m, m2hm, sunTimes, lightPhase, moon, dist, nearestSpot, parse, fetchWeather, wxSummary, compass, wmo, groupStats, durH, addDays };
})(typeof window !== "undefined" ? window : globalThis);
