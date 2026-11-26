// Builds streak cards from the GitHub contribution calendar (private
// contributions included when the token belongs to the profile owner).
// Every theme is written to assets/streak-<theme>.svg; the theme from
// STREAK_THEME (default "sunset") is also written to assets/streak.svg.
// No dependencies.
import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN is not set");
  process.exit(1);
}

// ---- themes ------------------------------------------------------------
const THEMES = {
  // Neon synthwave sunset: striped sun, palms, neon grid.
  sunset: {
    sky: ["#0d0221", "#2b0b4f", "#6a1b6e", "#c7366f", "#ff7b54"],
    stars: true,
    sunStyle: "bands", sun: ["#ffe66d", "#ff9a3c", "#ff3d7f"], sunGlow: "#ff5e8a",
    building: "#1b0a33", edge: "#ff3d7f", hot: "#2de2e6", window: "#ffd36b", windowEvery: 3,
    ground: ["#1a0636", "#090114"], groundStyle: "grid", grid: "#ff3d7f", gridOpacity: 0.35,
    horizon: "#ff6ec7",
    palms: "fan", palm: "#0b0218",
    label: "#ffc4ec", value: "#ffffff", sub: "#f7a8d8", foot: "#ff9ad5",
    glow: "#ff3d7f", glowCenter: "#2de2e6",
  },
  // Lavender dusk over a gothic art-deco city: golden halo, amber windows,
  // spires and a cable car.
  deco: {
    sky: ["#1e1730", "#2f2550", "#4d3f75", "#7c6a9e", "#b09bc4"],
    stars: false,
    sunStyle: "ring", sun: ["#f6b73c", "#f6b73c", "#f6b73c"], sunGlow: "#f59e0b",
    backTowers: "#4a3d6c",
    building: "#241c33", edge: "#3d3150", hot: "#f6b73c", window: "#ffb347", windowEvery: 2,
    spires: true, setbacks: true,
    ground: ["#1d1630", "#0c0814"], groundStyle: "water", grid: "#f6b73c", gridOpacity: 0.14,
    horizon: "#c9a56a",
    cableCar: { line: "#14101d", body: "#1b1526", window: "#ffb347" },
    label: "#f6c97a", value: "#fff4e0", sub: "#e8d5b5", foot: "#cdb8e0",
    glow: "#b45309", glowCenter: "#f59e0b",
  },
  // Golden hour over the hills: teal sky, warm sun, radio tower, tall palms,
  // an open road.
  americana: {
    sky: ["#21788a", "#3f9ea4", "#86bfae", "#f2b97c", "#e8743c"],
    stars: false,
    sunStyle: "plain", sun: ["#fff4c2", "#ffd07a", "#f7a24b"], sunGlow: "#ffb067",
    hillsFar: "#c98a5a", hills: "#a35a2c", tower: { color: "#3b2418", light: "#ef4444" },
    haze: "#f4a66a",
    building: "#646a7c", edge: "#8a93a8", hot: "#ffe08a", window: "#ffd38a", windowEvery: 3,
    ground: ["#7a5230", "#3a2414"], groundStyle: "road", horizon: "#f2b47a",
    road: { fill: "#2e2622", edge: "#f5e6c8", dash: "#f4c95d" },
    palms: "tall", palm: "#2b1a12",
    label: "#fff3d6", value: "#ffffff", sub: "#fff1d6", foot: "#f5e6c8",
    glow: "#9a3412", glowCenter: "#c2410c", shadow: "#3b1d0e",
  },
};

const defaultTheme = process.env.STREAK_THEME || "sunset";
if (!THEMES[defaultTheme]) {
  console.error(`Unknown STREAK_THEME "${defaultTheme}". Use one of: ${Object.keys(THEMES).join(", ")}`);
  process.exit(1);
}

// ---- data --------------------------------------------------------------
const query = `{
  viewer {
    login
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const json = await res.json();
if (!res.ok || json.errors) {
  console.error(JSON.stringify(json.errors ?? json, null, 2));
  process.exit(1);
}

const { login } = json.data.viewer;
const cal = json.data.viewer.contributionsCollection.contributionCalendar;
const weeks = cal.weeks.map((w) => w.contributionDays);
const days = weeks.flat();

// ---- streak math -------------------------------------------------------
let longest = { len: 0, start: null, end: null };
let run = { len: 0, start: null };
for (const d of days) {
  if (d.contributionCount > 0) {
    if (run.len === 0) run.start = d.date;
    run.len++;
    if (run.len > longest.len) longest = { len: run.len, start: run.start, end: d.date };
  } else {
    run = { len: 0, start: null };
  }
}

// Today without commits does not break the streak yet.
let i = days.length - 1;
if (i >= 0 && days[i].contributionCount === 0) i--;
const current = { len: 0, start: null, end: i >= 0 ? days[i].date : null };
while (i >= 0 && days[i].contributionCount > 0) {
  current.len++;
  current.start = days[i].date;
  i--;
}
const inCurrent = (date) =>
  current.len > 0 && date >= current.start && date <= current.end;

const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);
const totals = weeks.map((w) => w.reduce((s, d) => s + d.contributionCount, 0));
const maxWeek = Math.max(1, ...totals);

// ---- helpers -----------------------------------------------------------
const fmt = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const range = (s) => (s.len ? `${fmt(s.start)} – ${fmt(s.end)}` : "no streak yet");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const num = (n) => n.toLocaleString("en-US");

// ---- scene pieces ------------------------------------------------------
const W = 840;
const H = 300;
const HORIZON = 205;
const SUN = { cx: W / 2, cy: HORIZON - 18, r: 86 };

function palm(x, base, h, dir, color, s = 1) {
  const topX = x + dir * 18 * s;
  const topY = base - h;
  // Each frond is a filled leaf: upper and lower curves meeting at the tip.
  const fronds = [
    [-78, 34], [-62, 50], [-30, 58], [-6, 40], [24, 56], [58, 50], [80, 30], [-70, 8], [72, 6],
  ]
    .map(([dx, dy]) => {
      const tx = topX + dx * s;
      const ty = topY + dy * s;
      const ux = topX + dx * s * 0.5;
      const uy = topY + (-16 + dy * 0.2) * s;
      const lx = topX + dx * s * 0.55;
      const ly = topY + (2 + dy * 0.5) * s;
      return `<path d="M${topX} ${topY} Q${ux} ${uy} ${tx} ${ty} Q${lx} ${ly} ${topX} ${topY + 4 * s}Z"/>`;
    })
    .join("");
  const tw = 5 * Math.max(s, 0.6);
  const trunk = `M${x - tw} ${base} Q${x + dir * 4} ${base - h * 0.55} ${topX - tw / 2} ${topY} L${topX + tw / 2} ${topY} Q${x + dir * 4 + tw} ${base - h * 0.55} ${x + tw} ${base}Z`;
  return `<g fill="${color}"><path d="${trunk}"/>${fronds}<circle cx="${topX}" cy="${topY + 3 * s}" r="${5 * s}"/></g>`;
}

const f = (n) => n.toFixed(1);

// Skinny California-style palm: thin trunk, dense round crown, dry "skirt".
function tallPalm(x, base, h, dir, color, s) {
  const topX = x + dir * 10 * s;
  const topY = base - h;
  const L = 70 * s;
  const leaf = (tx, ty, ux, uy, lx, ly) =>
    `<path d="M${f(topX)} ${f(topY)} Q${f(ux)} ${f(uy)} ${f(tx)} ${f(ty)} Q${f(lx)} ${f(ly)} ${f(topX)} ${f(topY + 4 * s)}Z"/>`;
  let fronds = "";
  for (let j = 0; j <= 12; j++) {
    const a = Math.PI * (0.02 + (0.96 * j) / 12);
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const tx = topX + cos * L;
    const ty = topY - sin * L * 0.45 + (1 - sin) * L * 0.55;
    fronds += leaf(tx, ty, topX + cos * L * 0.5, topY - sin * L * 0.55 - 6 * s, topX + cos * L * 0.55, topY - sin * L * 0.2 + 2 * s);
  }
  for (const d of [-0.8, -0.35, 0.35, 0.8]) {
    fronds += leaf(topX + d * L * 0.7, topY + L * 0.6, topX + d * L * 0.65, topY - 2 * s, topX + d * L * 0.2, topY + L * 0.25);
  }
  const skirt = `M${f(topX - 7 * s)} ${f(topY + 2 * s)} L${f(topX + 7 * s)} ${f(topY + 2 * s)} L${f(topX + 4 * s)} ${f(topY + 26 * s)} L${f(topX - 4 * s)} ${f(topY + 26 * s)}Z`;
  const trunk = `M${f(x - 3.4)} ${base} Q${f(x + dir * 3)} ${f(base - h * 0.5)} ${f(topX - 1.8)} ${f(topY)} L${f(topX + 1.8)} ${f(topY)} Q${f(x + dir * 3 + 3.4)} ${f(base - h * 0.5)} ${f(x + 3.4)} ${base}Z`;
  return `<g fill="${color}"><path d="${trunk}"/><path d="${skirt}"/>${fronds}</g>`;
}

function palms(t) {
  if (t.palms === "fan") {
    return palm(62, HORIZON + 40, 150, 1, t.palm) + palm(W - 62, HORIZON + 40, 140, -1, t.palm);
  }
  if (t.palms === "tall") {
    return (
      tallPalm(30, HORIZON + 40, 190, 1, t.palm, 0.6) +
      tallPalm(96, HORIZON + 40, 118, 1, t.palm, 0.5) +
      tallPalm(W - 30, HORIZON + 40, 184, -1, t.palm, 0.6) +
      tallPalm(W - 96, HORIZON + 40, 112, -1, t.palm, 0.5)
    );
  }
  return "";
}

// Distant towers on the sides, keeping the halo in the middle clear.
function backTowers(t) {
  if (!t.backTowers) return "";
  let seed = 11;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return [28, 84, 146, 218, 286, 560, 622, 690, 752, 806]
    .map((x) => {
      const w = 18 + rand() * 18;
      const h = 52 + rand() * 42;
      const y = HORIZON - h;
      let out = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
      if (rand() > 0.35) {
        const sh = Math.min(30, y - 100);
        out += `<path d="M${f(x + w * 0.2)} ${f(y)} L${f(x + w / 2)} ${f(y - sh)} L${f(x + w * 0.8)} ${f(y)}Z"/>`;
      }
      for (let n = 0; n < 3; n++) {
        if (rand() > 0.45) {
          out += `<rect x="${f(x + 4 + rand() * (w - 10))}" y="${f(y + 8 + rand() * (h - 30))}" width="3" height="4" fill="${t.window}" opacity="0.45"/>`;
        }
      }
      return out;
    })
    .join("")
    .replace(/^/, `<g fill="${t.backTowers}">`)
    .concat("</g>");
}

function sun(t) {
  const glow = `<circle class="pulse" cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r + 14}" fill="${t.sunGlow}" filter="url(#blur)"/>`;
  if (t.sunStyle === "ring") {
    // A golden halo instead of a solid sun.
    const r = SUN.r + 10;
    const cy = HORIZON - 8;
    return `<circle class="pulse" cx="${SUN.cx}" cy="${cy}" r="${r}" fill="${t.sunGlow}" opacity="0.3" filter="url(#blur)"/>
      <circle cx="${SUN.cx}" cy="${cy}" r="${r - 15}" fill="none" stroke="${t.sun[0]}" stroke-width="1.5" opacity="0.35"/>
      <circle cx="${SUN.cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.sun[0]}" stroke-width="5" filter="url(#neon)"/>`;
  }
  const mask = t.sunStyle === "bands" ? ' mask="url(#bands)"' : "";
  return `${glow}<circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}" fill="url(#sun)"${mask}/>`;
}

function hills(t) {
  if (!t.hills) return "";
  const y = (d) => HORIZON - d;
  let out = "";
  if (t.hillsFar) {
    out += `<path d="M0 ${HORIZON} L0 ${y(52)} C140 ${y(96)} 260 ${y(58)} 380 ${y(70)} S620 ${y(60)} 720 ${y(92)} S810 ${y(70)} ${W} ${y(78)} L${W} ${HORIZON}Z" fill="${t.hillsFar}"/>`;
  }
  out += `<path d="M0 ${HORIZON} L0 ${y(36)} C120 ${y(70)} 220 ${y(28)} 330 ${y(46)} S560 ${y(84)} 650 ${y(70)} S790 ${y(36)} ${W} ${y(50)} L${W} ${HORIZON}Z" fill="${t.hills}"/>`;
  if (t.tower) {
    // Lattice radio tower on the hill, in the gap between the stats.
    const x = 520;
    const b = y(76);
    const top = b - 50;
    out += `<g stroke="${t.tower.color}" stroke-width="1.6" fill="none">
      <path d="M${x - 10} ${b} L${x} ${top} L${x + 10} ${b}"/>
      <path d="M${x - 7} ${b - 16} L${x + 7} ${b - 16} M${x - 4.5} ${b - 32} L${x + 4.5} ${b - 32} M${x - 7} ${b - 16} L${x + 4.5} ${b - 32} M${x + 7} ${b - 16} L${x - 4.5} ${b - 32}"/>
    </g><circle cx="${x}" cy="${top - 2}" r="2.4" fill="${t.tower.light}"/>`;
  }
  return out;
}

function skyline(t) {
  const left = 34;
  const bw = (W - left * 2) / weeks.length;
  return weeks
    .map((w, k) => {
      // sqrt keeps one huge week from flattening the rest of the skyline
      const h = 8 + Math.sqrt(totals[k] / maxWeek) * 72;
      const x = left + k * bw;
      const y = HORIZON - h;
      const hot = w.some((d) => inCurrent(d.date));
      let out = "";
      if (t.spires && k % 4 === 1 && h > 20) {
        out += `<path d="M${(x + 1).toFixed(1)} ${y.toFixed(1)} L${(x + bw / 2).toFixed(1)} ${(y - 16).toFixed(1)} L${(x + bw - 1).toFixed(1)} ${y.toFixed(1)}Z" fill="${t.building}"/>`;
      }
      if (t.setbacks && k % 4 === 3 && h > 24) {
        out += `<rect x="${f(x + bw * 0.25)}" y="${f(y - 8)}" width="${f(bw * 0.5)}" height="9" fill="${t.building}"/>`;
      }
      out += `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${t.building}"/>`;
      out += `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="2" fill="${hot ? t.hot : t.edge}" opacity="${hot ? 1 : 0.7}"${hot ? ' filter="url(#neon)"' : ""}/>`;
      for (let row = 0; y + 6 + row * 8 < HORIZON - 4; row++) {
        if ((row + k) % t.windowEvery === 0) {
          out += `<rect x="${(x + bw / 2 - 1.2).toFixed(1)}" y="${(y + 6 + row * 8).toFixed(1)}" width="2.4" height="2.4" fill="${t.window}" opacity="0.8"/>`;
        }
      }
      return out;
    })
    .join("");
}

function ground(t) {
  const lineY = (k) => HORIZON + 4 + (k + 1) ** 2 * 2.1;
  if (t.groundStyle === "water") {
    // Dark water: mirrored skyline, the halo's reflection and light ripples.
    let seed = 23;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const left = 34;
    const bw = (W - left * 2) / weeks.length;
    const mirror = weeks
      .map((w, k) => {
        const h = (8 + Math.sqrt(totals[k] / maxWeek) * 72) * 0.45;
        const hot = w.some((d) => inCurrent(d.date));
        return `<rect x="${f(left + k * bw + 1)}" y="${HORIZON + 1}" width="${f(bw - 2)}" height="${f(h)}" fill="${hot ? t.hot : t.building}" opacity="${hot ? 0.1 : 0.6}"/>`;
      })
      .join("");
    const r = SUN.r + 10;
    const ripples = Array.from({ length: 34 }, () => {
      const nearHalo = rand() > 0.4;
      const x = nearHalo ? SUN.cx + (rand() * 2 - 1) * r : rand() * W;
      const y = HORIZON + 6 + rand() * 82;
      const len = 6 + rand() * 22;
      return `<line x1="${f(x - len / 2)}" y1="${f(y)}" x2="${f(x + len / 2)}" y2="${f(y)}" opacity="${(0.15 + rand() * 0.35).toFixed(2)}"/>`;
    }).join("");
    return `${mirror}
      <ellipse cx="${SUN.cx}" cy="${HORIZON + 1}" rx="${r}" ry="${f(r * 0.3)}" fill="none" stroke="${t.sun[0]}" stroke-width="3" opacity="0.35" clip-path="url(#below)"/>
      <g stroke="${t.window}" stroke-width="1.4" stroke-linecap="round">${ripples}</g>`;
  }
  if (t.groundStyle === "road") {
    const { fill, edge, dash } = t.road;
    const c = SUN.cx;
    const dashes = Array.from({ length: 5 }, (_, k) => {
      const y1 = lineY(k) + 1;
      const y2 = y1 + 2 + k * 1.8;
      return `<line x1="${c}" y1="${y1.toFixed(1)}" x2="${c}" y2="${y2.toFixed(1)}" stroke-width="${(1 + k * 0.5).toFixed(1)}"/>`;
    }).join("");
    return `<path d="M${c - 5} ${HORIZON} L${c + 5} ${HORIZON} L${c + 320} ${H} L${c - 320} ${H}Z" fill="${fill}"/>
      <g stroke="${edge}" stroke-width="2" opacity="0.6"><line x1="${c - 5}" y1="${HORIZON}" x2="${c - 320}" y2="${H}"/><line x1="${c + 5}" y1="${HORIZON}" x2="${c + 320}" y2="${H}"/></g>
      <g stroke="${dash}">${dashes}</g>`;
  }
  const gridH = Array.from({ length: 7 }, (_, k) => {
    const y = lineY(k);
    return `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}"/>`;
  }).join("");
  const gridV =
    t.groundStyle === "grid"
      ? Array.from({ length: 23 }, (_, k) => {
          const x = SUN.cx + (k - 11) * 90;
          return `<line x1="${SUN.cx}" y1="${HORIZON}" x2="${x}" y2="${H}"/>`;
        }).join("")
      : "";
  return `<g stroke="${t.grid}" stroke-width="1" opacity="${t.gridOpacity}">${gridH}${gridV}</g>`;
}

function cableCar(t) {
  if (!t.cableCar) return "";
  const { line, body, window } = t.cableCar;
  // Cable from off-canvas to a pylon standing in the city.
  const px = 300;
  const y0 = 104;
  const y1 = 150;
  const x = 140;
  const y = y0 + (y1 - y0) * (x / px);
  const panes = [0, 1, 2].map((n) => `<rect x="${f(x - 13 + n * 9.5)}" y="${f(y + 11)}" width="6" height="7" fill="${window}"/>`).join("");
  return `<g stroke="${line}" stroke-width="1.5"><line x1="0" y1="${y0}" x2="${px}" y2="${y1}"/><line x1="0" y1="${y0 + 6}" x2="${px}" y2="${y1 + 6}"/></g>
    <g fill="${line}"><rect x="${px - 2}" y="${y1 - 4}" width="4" height="${HORIZON - y1 + 4}"/><rect x="${px - 10}" y="${y1 - 4}" width="20" height="4"/></g>
    <line x1="${x}" y1="${f(y)}" x2="${x}" y2="${f(y + 8)}" stroke="${line}" stroke-width="2"/>
    <rect x="${x - 17}" y="${f(y + 7)}" width="34" height="18" rx="2" fill="${body}"/>${panes}`;
}

// ---- card --------------------------------------------------------------
function render(t) {
  // Deterministic pseudo-random for stars, so the SVG only changes with data.
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const stars = t.stars
    ? Array.from({ length: 46 }, () => {
        const x = (rand() * W).toFixed(1);
        const y = (rand() * 120).toFixed(1);
        const r = (0.4 + rand() * 1.1).toFixed(2);
        const o = (0.25 + rand() * 0.6).toFixed(2);
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
      }).join("")
    : "";

  // Horizontal cut-outs in the lower half of a banded sun.
  const sunBands = Array.from({ length: 6 }, (_, k) => {
    const y = SUN.cy - 46 + k * 9.5;
    const h = 1.6 + k * 1.1;
    return `<rect x="0" y="${y}" width="${W}" height="${h.toFixed(1)}" fill="#000"/>`;
  }).join("");

  const stops = (colors) =>
    colors
      .map((c, k) => `<stop offset="${(k / (colors.length - 1)).toFixed(2)}" stop-color="${c}"/>`)
      .join("");

  const shadow = t.shadow ? ' filter="url(#shadow)"' : "";
  const stat = (x, label, value, sub, glowId, size) => `
    <text x="${x}" y="34" class="label"${shadow}>${label}</text>
    <text x="${x}" y="${34 + size}" class="value" font-size="${size}" filter="url(#${glowId})">${value}</text>
    <text x="${x}" y="${52 + size}" class="sub"${shadow}>${sub}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${login}: current streak ${current.len} days, longest ${longest.len} days, ${cal.totalContributions} contributions in the last year">
  <style>
    text { font-family: "Segoe UI", Ubuntu, "Helvetica Neue", Arial, sans-serif; text-anchor: middle; }
    .label { font-size: 11px; letter-spacing: 3px; fill: ${t.label}; font-weight: 600; }
    .value { font-weight: 800; font-style: italic; fill: ${t.value}; }
    .sub { font-size: 11px; fill: ${t.sub}; }
    .foot { font-size: 11px; fill: ${t.foot}; opacity: 0.85; }
    .pulse { animation: pulse 4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.85; } }
    @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
  </style>
  <defs>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
    <clipPath id="above"><rect width="${W}" height="${HORIZON}"/></clipPath>
    <clipPath id="below"><rect y="${HORIZON}" width="${W}" height="${H - HORIZON}"/></clipPath>
    ${t.haze ? `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.haze}" stop-opacity="0"/><stop offset="1" stop-color="${t.haze}" stop-opacity="0.35"/></linearGradient>` : ""}
    ${t.shadow ? `<filter id="shadow" x="-10%" y="-40%" width="120%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="${t.shadow}" flood-opacity="0.85"/></filter>` : ""}
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops(t.sky)}</linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">${stops(t.sun)}</linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">${stops(t.ground)}</linearGradient>
    <mask id="bands"><rect width="${W}" height="${H}" fill="#fff"/>${sunBands}</mask>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="neon" x="-50%" y="-200%" width="200%" height="500%">
      <feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${t.glow}" flood-opacity="0.9"/>
    </filter>
    <filter id="glow-center" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="${t.glowCenter}" flood-opacity="0.9"/>
    </filter>
  </defs>

  <g clip-path="url(#card)">
    <rect width="${W}" height="${HORIZON}" fill="url(#sky)"/>
    ${stars}
    <g clip-path="url(#above)">${sun(t)}</g>
    ${backTowers(t)}
    ${hills(t)}
    ${skyline(t)}
    ${t.haze ? `<rect y="${HORIZON - 70}" width="${W}" height="70" fill="url(#haze)"/>` : ""}
    <rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#ground)"/>
    ${ground(t)}
    <line x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}" stroke="${t.horizon}" stroke-width="2" filter="url(#neon)"/>
    ${cableCar(t)}
    ${palms(t)}

    ${stat(190, "TOTAL · 1 YEAR", num(cal.totalContributions), `best day ${fmt(best.date)} · ${best.contributionCount}`, "glow", 32)}
    ${stat(W / 2, "CURRENT STREAK", plural(current.len, "day"), range(current), "glow-center", 40)}
    ${stat(W - 190, "LONGEST STREAK", plural(longest.len, "day"), range(longest), "glow", 32)}

    <text x="${W / 2}" y="${H - 14}" class="foot"${shadow}>@${login} · last 365 days</text>
  </g>
</svg>
`;
}

const dir = new URL("../assets/", import.meta.url);
await mkdir(dir, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  const svg = render(theme);
  await writeFile(new URL(`streak-${name}.svg`, dir), svg);
  if (name === defaultTheme) await writeFile(new URL("streak.svg", dir), svg);
}
console.log(
  `current ${current.len} (${range(current)}), longest ${longest.len} (${range(longest)}), total ${cal.totalContributions}; themes: ${Object.keys(THEMES).join(", ")}; default: ${defaultTheme}`,
);
