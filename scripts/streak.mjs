// Builds assets/streak.svg: a sunset-synthwave streak card from the
// GitHub contribution calendar (private contributions included when the
// token belongs to the profile owner). No dependencies.
import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN is not set");
  process.exit(1);
}

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

// Deterministic pseudo-random for stars, so the SVG only changes with data.
let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

// ---- scene -------------------------------------------------------------
const W = 840;
const H = 300;
const HORIZON = 205;
const SUN = { cx: W / 2, cy: HORIZON - 18, r: 86 };

const stars = Array.from({ length: 46 }, () => {
  const x = (rand() * W).toFixed(1);
  const y = (rand() * 120).toFixed(1);
  const r = (0.4 + rand() * 1.1).toFixed(2);
  const o = (0.25 + rand() * 0.6).toFixed(2);
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
}).join("");

// Horizontal cut-outs in the lower half of the sun.
const sunBands = Array.from({ length: 6 }, (_, k) => {
  const y = SUN.cy - 46 + k * 9.5;
  const h = 1.6 + k * 1.1;
  return `<rect x="0" y="${y}" width="${W}" height="${h.toFixed(1)}" fill="#000"/>`;
}).join("");

// Skyline: one building per week, height = weekly contributions.
const totals = weeks.map((w) => w.reduce((s, d) => s + d.contributionCount, 0));
const maxWeek = Math.max(1, ...totals);
const left = 34;
const span = W - left * 2;
const bw = span / weeks.length;
const skyline = weeks
  .map((w, k) => {
    // sqrt keeps one huge week from flattening the rest of the skyline
    const h = 8 + Math.sqrt(totals[k] / maxWeek) * 72;
    const x = left + k * bw;
    const y = HORIZON - h;
    const hot = w.some((d) => inCurrent(d.date));
    const edge = hot ? "#2de2e6" : "#ff3d7f";
    let windows = "";
    for (let row = 0; y + 6 + row * 8 < HORIZON - 4; row++) {
      if ((row + k) % 3 === 0) {
        windows += `<rect x="${(x + bw / 2 - 1.2).toFixed(1)}" y="${(y + 6 + row * 8).toFixed(1)}" width="2.4" height="2.4" fill="#ffd36b" opacity="0.75"/>`;
      }
    }
    return (
      `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#1b0a33"/>` +
      `<rect x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="2" fill="${edge}" opacity="${hot ? 1 : 0.7}"${hot ? ' filter="url(#neon)"' : ""}/>` +
      windows
    );
  })
  .join("");

// Perspective grid on the ground.
const gridH = Array.from({ length: 7 }, (_, k) => {
  const y = HORIZON + 4 + (k + 1) ** 2 * 2.1;
  return `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}"/>`;
}).join("");
const gridV = Array.from({ length: 23 }, (_, k) => {
  const x = SUN.cx + (k - 11) * 90;
  return `<line x1="${SUN.cx}" y1="${HORIZON}" x2="${x}" y2="${H}"/>`;
}).join("");

function palm(x, base, h, dir) {
  const topX = x + dir * 18;
  const topY = base - h;
  // Each frond is a filled leaf: upper and lower curves meeting at the tip.
  const fronds = [
    [-78, 34], [-62, 50], [-30, 58], [-6, 40], [24, 56], [58, 50], [80, 30], [-70, 8], [72, 6],
  ]
    .map(([dx, dy]) => {
      const tx = topX + dx;
      const ty = topY + dy;
      const ux = topX + dx * 0.5;
      const uy = topY - 16 + dy * 0.2;
      const lx = topX + dx * 0.55;
      const ly = topY + 2 + dy * 0.5;
      return `<path d="M${topX} ${topY} Q${ux} ${uy} ${tx} ${ty} Q${lx} ${ly} ${topX} ${topY + 4}Z"/>`;
    })
    .join("");
  const trunk = `M${x - 5} ${base} Q${x + dir * 4} ${base - h * 0.55} ${topX - 2.5} ${topY} L${topX + 2.5} ${topY} Q${x + dir * 4 + 6} ${base - h * 0.55} ${x + 5} ${base}Z`;
  return `<g fill="#0b0218">
    <path d="${trunk}"/>
    ${fronds}
    <circle cx="${topX}" cy="${topY + 3}" r="5"/>
  </g>`;
}

const stat = (x, label, value, sub, color, size) => `
  <text x="${x}" y="34" class="label">${label}</text>
  <text x="${x}" y="${34 + size}" class="value" font-size="${size}" fill="#fff" filter="url(#glow-${color})">${value}</text>
  <text x="${x}" y="${52 + size}" class="sub">${sub}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${login}: current streak ${current.len} days, longest ${longest.len} days, ${cal.totalContributions} contributions in the last year">
  <style>
    text { font-family: "Segoe UI", Ubuntu, "Helvetica Neue", Arial, sans-serif; text-anchor: middle; }
    .label { font-size: 11px; letter-spacing: 3px; fill: #ffc4ec; font-weight: 600; }
    .value { font-weight: 800; font-style: italic; }
    .sub { font-size: 11px; fill: #f7a8d8; }
    .foot { font-size: 11px; fill: #ff9ad5; opacity: 0.75; }
    .pulse { animation: pulse 4s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.85; } }
    @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
  </style>
  <defs>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="16"/></clipPath>
    <clipPath id="above"><rect width="${W}" height="${HORIZON}"/></clipPath>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d0221"/>
      <stop offset="0.4" stop-color="#2b0b4f"/>
      <stop offset="0.68" stop-color="#6a1b6e"/>
      <stop offset="0.88" stop-color="#c7366f"/>
      <stop offset="1" stop-color="#ff7b54"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe66d"/>
      <stop offset="0.5" stop-color="#ff9a3c"/>
      <stop offset="1" stop-color="#ff3d7f"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a0636"/>
      <stop offset="1" stop-color="#090114"/>
    </linearGradient>
    <mask id="bands"><rect width="${W}" height="${H}" fill="#fff"/>${sunBands}</mask>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="neon" x="-50%" y="-200%" width="200%" height="500%">
      <feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-pink" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#ff3d7f" flood-opacity="0.9"/>
    </filter>
    <filter id="glow-cyan" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#2de2e6" flood-opacity="0.9"/>
    </filter>
  </defs>

  <g clip-path="url(#card)">
    <rect width="${W}" height="${HORIZON}" fill="url(#sky)"/>
    ${stars}

    <g clip-path="url(#above)">
      <circle class="pulse" cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r + 14}" fill="#ff5e8a" filter="url(#blur)"/>
      <circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}" fill="url(#sun)" mask="url(#bands)"/>
    </g>

    ${skyline}

    <rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#ground)"/>
    <g stroke="#ff3d7f" stroke-width="1" opacity="0.35">${gridH}${gridV}</g>
    <line x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}" stroke="#ff6ec7" stroke-width="2" filter="url(#neon)"/>

    ${palm(62, HORIZON + 40, 150, 1)}
    ${palm(W - 62, HORIZON + 40, 140, -1)}

    ${stat(190, "TOTAL · 1 YEAR", num(cal.totalContributions), `best day ${fmt(best.date)} · ${best.contributionCount}`, "pink", 32)}
    ${stat(W / 2, "CURRENT STREAK", plural(current.len, "day"), range(current), "cyan", 40)}
    ${stat(W - 190, "LONGEST STREAK", plural(longest.len, "day"), range(longest), "pink", 32)}

    <text x="${W / 2}" y="${H - 14}" class="foot">@${login} · last 365 days</text>
  </g>
</svg>
`;

await mkdir(new URL("../assets/", import.meta.url), { recursive: true });
await writeFile(new URL("../assets/streak.svg", import.meta.url), svg);
console.log(
  `current ${current.len} (${range(current)}), longest ${longest.len} (${range(longest)}), total ${cal.totalContributions}`,
);
