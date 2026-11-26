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

const SANS = `"Segoe UI", Ubuntu, "Helvetica Neue", Arial, sans-serif`;
const SERIF = `Georgia, "Times New Roman", serif`;

// ---- themes ------------------------------------------------------------
const THEMES = {
  // Neon synthwave sunset: striped sun, palms, laser grid.
  sunset: {
    scene: "synth",
    sky: ["#0d0221", "#2b0b4f", "#6a1b6e", "#c7366f", "#ff7b54"],
    stars: true,
    sunStyle: "bands", sun: ["#ffe66d", "#ff9a3c", "#ff3d7f"], sunGlow: "#ff5e8a",
    building: "#1b0a33", edge: "#ff3d7f", hot: "#2de2e6", window: "#ffd36b",
    ground: ["#1a0636", "#090114"], groundStyle: "grid", grid: "#ff3d7f", gridOpacity: 0.35,
    horizon: "#ff6ec7",
    palms: "fan", palm: "#0b0218",
    font: SANS, italic: true,
    label: "#ffc4ec", value: "#ffffff", sub: "#f7a8d8",
    glow: "#ff3d7f", glowCenter: "#2de2e6",
  },
  // Pastel Miami dusk: periwinkle-to-peach sky, lilac haze, plum silhouettes.
  dusk: {
    scene: "synth",
    sky: ["#34226e", "#6a4fd6", "#b65dd5", "#f46cb4", "#f6a06e"],
    stars: true,
    sunStyle: "bands", sun: ["#ffe2a8", "#ffa27c", "#f46cb4"], sunGlow: "#ff9ac4",
    haze: "#c58bf0",
    building: "#3a2a6e", edge: "#ff9ccf", hot: "#8ff0ff", window: "#ffc988",
    ground: ["#3b2563", "#1b1130"], groundStyle: "grid", grid: "#ff8fc8", gridOpacity: 0.4,
    horizon: "#ffb3d6",
    palms: "fan", palm: "#2a1d3d",
    font: SANS, italic: true,
    label: "#ffe6f4", value: "#ffffff", sub: "#ffd6ea",
    glow: "#c2408f", glowCenter: "#6a4fd6", shadow: "#2a1650",
  },
  // Foggy occult noir: teal-lit art-deco towers in mist, a wire of hanging
  // charms and bulbs, a street lamp, candles and ghostly pigeons.
  noir: {
    scene: "noir",
    sky: ["#061110", "#0b211e", "#12352f", "#245246", "#6f927c"],
    farTower: "#163630", midTower: "#0d2420", building: "#050e0d",
    window: "#6fd6b0", warm: "#f2c46d", hot: "#8dffd6",
    fog: "#a5c9ae", ground: ["#0a1614", "#020605"],
    charm: "#040a09", charmLine: "#c9bfa5", bulb: "#fff1c9", bulbGlow: "#ffe9a8",
    candle: ["#f3e9d2", "#c9b48f"], flame: "#ffd27a", flameGlow: "#ffb347",
    ghost: "#9bffd8",
    font: SERIF, italic: false, labelSpacing: 4,
    label: "#e8dcc2", value: "#f3ead6", sub: "#b9cbb8",
    glow: "#1f6b58", glowCenter: "#5fe3b1",
  },
  // Golden hour over the hills: teal sky, warm sun, radio tower, tall palms,
  // an open road.
  americana: {
    scene: "synth",
    sky: ["#21788a", "#3f9ea4", "#86bfae", "#f2b97c", "#e8743c"],
    stars: false,
    sunStyle: "plain", sun: ["#fff4c2", "#ffd07a", "#f7a24b"], sunGlow: "#ffb067",
    hillsFar: "#c98a5a", hills: "#a35a2c", tower: { color: "#3b2418", light: "#ef4444" },
    haze: "#f4a66a",
    building: "#646a7c", edge: "#8a93a8", hot: "#ffe08a", window: "#ffd38a",
    ground: ["#7a5230", "#3a2414"], groundStyle: "road", horizon: "#f2b47a",
    road: { fill: "#2e2622", edge: "#f5e6c8", dash: "#f4c95d" },
    palms: "tall", palm: "#2b1a12",
    font: SANS, italic: true,
    label: "#fff3d6", value: "#ffffff", sub: "#fff1d6",
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
const f = (n) => n.toFixed(1);
const seeded = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

// ---- layout ------------------------------------------------------------
// A wide, short banner: stats on top, the scene below them, a strip of ground.
const W = 840;
const H = 220;
const HORIZON = 158;
const GROUND = H - HORIZON;
const SUN = { cx: W / 2, cy: HORIZON - 10, r: 62 };
const lineY = (k) => HORIZON + 3 + (k + 1) ** 2 * 1.2; // perspective rows, k = 0..6

// One building per week; height = commits that week (sqrt keeps one huge
// week from flattening the rest).
const LEFT = 34;
const BW = (W - LEFT * 2) / weeks.length;
const buildings = weeks.map((w, k) => {
  const h = 6 + Math.sqrt(totals[k] / maxWeek) * 52;
  return { k, x: LEFT + k * BW, y: HORIZON - h, h, hot: w.some((d) => inCurrent(d.date)) };
});

// ====== synth scene (sunset, dusk, americana) ===========================

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
      return `<path d="M${f(topX)} ${f(topY)} Q${f(topX + dx * s * 0.5)} ${f(topY + (-16 + dy * 0.2) * s)} ${f(tx)} ${f(ty)} Q${f(topX + dx * s * 0.55)} ${f(topY + (2 + dy * 0.5) * s)} ${f(topX)} ${f(topY + 4 * s)}Z"/>`;
    })
    .join("");
  const tw = 5 * s;
  const trunk = `M${f(x - tw)} ${base} Q${f(x + dir * 4)} ${f(base - h * 0.55)} ${f(topX - tw / 2)} ${f(topY)} L${f(topX + tw / 2)} ${f(topY)} Q${f(x + dir * 4 + tw)} ${f(base - h * 0.55)} ${f(x + tw)} ${base}Z`;
  return `<g fill="${color}"><path d="${trunk}"/>${fronds}<circle cx="${f(topX)}" cy="${f(topY + 3 * s)}" r="${f(5 * s)}"/></g>`;
}

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
    fronds += leaf(
      topX + cos * L, topY - sin * L * 0.45 + (1 - sin) * L * 0.55,
      topX + cos * L * 0.5, topY - sin * L * 0.55 - 6 * s,
      topX + cos * L * 0.55, topY - sin * L * 0.2 + 2 * s,
    );
  }
  for (const d of [-0.8, -0.35, 0.35, 0.8]) {
    fronds += leaf(topX + d * L * 0.7, topY + L * 0.6, topX + d * L * 0.65, topY - 2 * s, topX + d * L * 0.2, topY + L * 0.25);
  }
  const skirt = `M${f(topX - 7 * s)} ${f(topY + 2 * s)} L${f(topX + 7 * s)} ${f(topY + 2 * s)} L${f(topX + 4 * s)} ${f(topY + 26 * s)} L${f(topX - 4 * s)} ${f(topY + 26 * s)}Z`;
  const trunk = `M${f(x - 3)} ${base} Q${f(x + dir * 3)} ${f(base - h * 0.5)} ${f(topX - 1.6)} ${f(topY)} L${f(topX + 1.6)} ${f(topY)} Q${f(x + dir * 3 + 3)} ${f(base - h * 0.5)} ${f(x + 3)} ${base}Z`;
  return `<g fill="${color}"><path d="${trunk}"/><path d="${skirt}"/>${fronds}</g>`;
}

function palms(t) {
  const base = HORIZON + 28;
  if (t.palms === "fan") {
    return palm(46, base, 112, 1, t.palm, 0.78) + palm(W - 46, base, 104, -1, t.palm, 0.78);
  }
  if (t.palms === "tall") {
    return (
      tallPalm(26, base, 150, 1, t.palm, 0.5) +
      tallPalm(84, base, 92, 1, t.palm, 0.42) +
      tallPalm(W - 26, base, 146, -1, t.palm, 0.5) +
      tallPalm(W - 84, base, 88, -1, t.palm, 0.42)
    );
  }
  return "";
}

function hills(t) {
  if (!t.hills) return "";
  const y = (d) => HORIZON - d * 0.62;
  let out = "";
  if (t.hillsFar) {
    out += `<path d="M0 ${HORIZON} L0 ${f(y(52))} C140 ${f(y(96))} 260 ${f(y(58))} 380 ${f(y(70))} S620 ${f(y(60))} 720 ${f(y(92))} S810 ${f(y(70))} ${W} ${f(y(78))} L${W} ${HORIZON}Z" fill="${t.hillsFar}"/>`;
  }
  out += `<path d="M0 ${HORIZON} L0 ${f(y(36))} C120 ${f(y(70))} 220 ${f(y(28))} 330 ${f(y(46))} S560 ${f(y(84))} 650 ${f(y(70))} S790 ${f(y(36))} ${W} ${f(y(50))} L${W} ${HORIZON}Z" fill="${t.hills}"/>`;
  if (t.tower) {
    // Lattice radio tower on the hill, in the gap between the stats.
    const x = 530;
    const b = y(78);
    const top = b - 36;
    out += `<g stroke="${t.tower.color}" stroke-width="1.4" fill="none">
      <path d="M${x - 8} ${f(b)} L${x} ${f(top)} L${x + 8} ${f(b)}"/>
      <path d="M${x - 5.5} ${f(b - 12)} L${x + 5.5} ${f(b - 12)} M${x - 3.5} ${f(b - 24)} L${x + 3.5} ${f(b - 24)} M${x - 5.5} ${f(b - 12)} L${x + 3.5} ${f(b - 24)} M${x + 5.5} ${f(b - 12)} L${x - 3.5} ${f(b - 24)}"/>
    </g><circle cx="${x}" cy="${f(top - 2)}" r="2.2" fill="${t.tower.light}"/>`;
  }
  return out;
}

function synthSkyline(t) {
  return buildings
    .map(({ k, x, y, h, hot }) => {
      let out = `<rect x="${f(x + 1)}" y="${f(y)}" width="${f(BW - 2)}" height="${f(h)}" fill="${t.building}"/>`;
      out += `<rect x="${f(x + 1)}" y="${f(y)}" width="${f(BW - 2)}" height="2" fill="${hot ? t.hot : t.edge}" opacity="${hot ? 1 : 0.7}"${hot ? ' filter="url(#neon)"' : ""}/>`;
      for (let row = 0; y + 5 + row * 7 < HORIZON - 3; row++) {
        if ((row + k) % 3 === 0) {
          out += `<rect x="${f(x + BW / 2 - 1.1)}" y="${f(y + 5 + row * 7)}" width="2.2" height="2.2" fill="${t.window}" opacity="0.8"/>`;
        }
      }
      return out;
    })
    .join("");
}

function synthGround(t) {
  if (t.groundStyle === "road") {
    const { fill, edge, dash } = t.road;
    const c = SUN.cx;
    const spread = 300;
    const dashes = Array.from({ length: 5 }, (_, k) => {
      const y1 = lineY(k) + 1;
      return `<line x1="${c}" y1="${f(y1)}" x2="${c}" y2="${f(Math.min(H - 2, y1 + 1.5 + k * 1.3))}" stroke-width="${f(1 + k * 0.45)}"/>`;
    }).join("");
    return `<path d="M${c - 5} ${HORIZON} L${c + 5} ${HORIZON} L${c + spread} ${H} L${c - spread} ${H}Z" fill="${fill}"/>
      <g stroke="${edge}" stroke-width="2" opacity="0.6"><line x1="${c - 5}" y1="${HORIZON}" x2="${c - spread}" y2="${H}"/><line x1="${c + 5}" y1="${HORIZON}" x2="${c + spread}" y2="${H}"/></g>
      <g stroke="${dash}">${dashes}</g>`;
  }
  const gridH = Array.from({ length: 7 }, (_, k) => `<line x1="0" y1="${f(lineY(k))}" x2="${W}" y2="${f(lineY(k))}"/>`).join("");
  const gridV = Array.from({ length: 31 }, (_, k) => `<line x1="${SUN.cx}" y1="${HORIZON}" x2="${SUN.cx + (k - 15) * 90}" y2="${H}"/>`).join("");
  return `<g stroke="${t.grid}" stroke-width="1" opacity="${t.gridOpacity}">${gridH}${gridV}</g>`;
}

function synthScene(t) {
  const rand = seeded(7);
  const stars = t.stars
    ? Array.from({ length: 40 }, () =>
        `<circle cx="${f(rand() * W)}" cy="${f(rand() * 92)}" r="${(0.4 + rand() * 1.1).toFixed(2)}" fill="#fff" opacity="${(0.25 + rand() * 0.6).toFixed(2)}"/>`,
      ).join("")
    : "";
  const mask = t.sunStyle === "bands" ? ' mask="url(#bands)"' : "";
  return `
    <rect width="${W}" height="${HORIZON}" fill="url(#sky)"/>
    ${stars}
    <g clip-path="url(#above)">
      <circle class="pulse" cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r + 12}" fill="${t.sunGlow}" filter="url(#blur)"/>
      <circle cx="${SUN.cx}" cy="${SUN.cy}" r="${SUN.r}" fill="url(#sun)"${mask}/>
    </g>
    ${hills(t)}
    ${synthSkyline(t)}
    ${t.haze ? `<rect y="${HORIZON - 50}" width="${W}" height="50" fill="url(#haze)"/>` : ""}
    <rect y="${HORIZON}" width="${W}" height="${GROUND}" fill="url(#ground)"/>
    ${synthGround(t)}
    <line x1="0" y1="${HORIZON}" x2="${W}" y2="${HORIZON}" stroke="${t.horizon}" stroke-width="2" filter="url(#neon)"/>
    ${palms(t)}`;
}

// ====== noir scene ======================================================

// Art-deco tower: body, two setback tiers, optional needle spire, a grid of
// randomly lit windows.
function decoTower(x, w, h, fill, t, rand, lit, winOpacity) {
  const y = HORIZON - h;
  let out = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
  out += `<rect x="${f(x + w * 0.15)}" y="${f(y - 7)}" width="${f(w * 0.7)}" height="8" fill="${fill}"/>`;
  out += `<rect x="${f(x + w * 0.3)}" y="${f(y - 12)}" width="${f(w * 0.4)}" height="6" fill="${fill}"/>`;
  if (rand() > 0.45) {
    out += `<path d="M${f(x + w * 0.44)} ${f(y - 12)} L${f(x + w / 2)} ${f(y - 26)} L${f(x + w * 0.56)} ${f(y - 12)}Z" fill="${fill}"/>`;
  }
  const cols = Math.max(2, Math.floor(w / 7));
  for (let row = 0; y + 5 + row * 6 < HORIZON - 5; row++) {
    for (let c = 0; c < cols; c++) {
      if (rand() < lit) {
        const warm = rand() > 0.88;
        out += `<rect x="${f(x + 3 + c * ((w - 6) / cols))}" y="${f(y + 5 + row * 6)}" width="2" height="2.6" fill="${warm ? t.warm : t.window}" opacity="${winOpacity}"/>`;
      }
    }
  }
  return out;
}

function towerLayer(t, seed, fill, minH, maxH, minW, maxW, lit, winOpacity) {
  const rand = seeded(seed);
  let out = "";
  for (let x = -12 + rand() * 20; x < W; x += minW + rand() * (maxW - minW) + 4) {
    const w = minW + rand() * (maxW - minW);
    const h = minH + rand() * (maxH - minH);
    out += decoTower(x, w, h, fill, t, rand, lit, winOpacity);
  }
  return out;
}

function noirSkyline(t) {
  const rand = seeded(31);
  return buildings
    .map(({ x, y, h, hot }) => {
      let out = `<rect x="${f(x + 0.5)}" y="${f(y)}" width="${f(BW - 1)}" height="${f(h)}" fill="${t.building}"/>`;
      if (hot) out += `<rect x="${f(x + 0.5)}" y="${f(y)}" width="${f(BW - 1)}" height="2" fill="${t.hot}" filter="url(#neon)"/>`;
      for (let row = 0; y + 4 + row * 5.5 < HORIZON - 3; row++) {
        for (const c of [0.28, 0.62]) {
          if (rand() < (hot ? 0.85 : 0.42)) {
            const color = hot ? t.hot : rand() > 0.9 ? t.warm : t.window;
            out += `<rect x="${f(x + BW * c)}" y="${f(y + 4 + row * 5.5)}" width="1.8" height="2.2" fill="${color}" opacity="${hot ? 1 : 0.8}"/>`;
          }
        }
      }
      return out;
    })
    .join("");
}

// A sagging wire across the street with hanging bells, charms and bulbs.
function charmWire(t) {
  const P0 = [0, 96];
  const P1 = [W / 2, 132];
  const P2 = [W, 96];
  const at = (u) => [
    (1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0],
    (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1],
  ];
  const kinds = ["bell", "tri", "bulb", "ring", "bell", "tri", "bulb", "tri", "bell", "ring", "bulb", "tri", "bell"];
  const items = kinds
    .map((kind, n) => {
      const [x, y] = at(0.06 + (n * 0.88) / (kinds.length - 1));
      const top = y + 5;
      let out = `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(top)}" stroke="${t.charm}" stroke-width="1"/>`;
      if (kind === "bell") {
        out += `<path d="M${f(x - 4)} ${f(top + 9)} Q${f(x - 4)} ${f(top)} ${f(x)} ${f(top)} Q${f(x + 4)} ${f(top)} ${f(x + 4)} ${f(top + 9)}Z" fill="${t.charm}"/><circle cx="${f(x)}" cy="${f(top + 10)}" r="1.2" fill="${t.charm}"/>`;
      } else if (kind === "tri") {
        out += `<path d="M${f(x)} ${f(top)} L${f(x - 5.5)} ${f(top + 10)} L${f(x + 5.5)} ${f(top + 10)}Z" fill="${t.charm}" stroke="${t.charmLine}" stroke-width="0.7" stroke-opacity="0.5"/><circle cx="${f(x)}" cy="${f(top + 6.5)}" r="1.5" fill="none" stroke="${t.charmLine}" stroke-width="0.7" stroke-opacity="0.6"/>`;
      } else if (kind === "ring") {
        out += `<circle cx="${f(x)}" cy="${f(top + 5)}" r="4.5" fill="none" stroke="${t.charm}" stroke-width="2"/><path d="M${f(x)} ${f(top + 1)} L${f(x)} ${f(top + 9)} M${f(x - 4)} ${f(top + 5)} L${f(x + 4)} ${f(top + 5)}" stroke="${t.charm}" stroke-width="1"/>`;
      } else {
        out += `<circle class="flicker" cx="${f(x)}" cy="${f(top + 4)}" r="12" fill="${t.bulbGlow}" opacity="0.35" filter="url(#soft)"/><circle cx="${f(x)}" cy="${f(top + 4)}" r="3" fill="${t.bulb}"/>`;
      }
      return out;
    })
    .join("");
  return `<path d="M${P0[0]} ${P0[1] - 12} Q${P1[0]} ${P1[1] - 16} ${P2[0]} ${P2[1] - 12}" fill="none" stroke="${t.charm}" stroke-width="1" opacity="0.8"/>
    <path d="M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}" fill="none" stroke="${t.charm}" stroke-width="1.4"/>${items}`;
}

function lamppost(t, x, dir) {
  const bx = x + dir * 16;
  const arm = 70;
  const base = H - 10;
  return `<polygon points="${bx},${arm + 11} ${bx - 28},${base} ${bx + 28},${base}" fill="${t.bulbGlow}" opacity="0.05"/>
    <g fill="${t.charm}">
      <rect x="${x - 2}" y="${arm + 12}" width="4" height="${base - arm - 12}"/><rect x="${x - 5}" y="${base - 6}" width="10" height="8"/>
      <path d="M${x} ${arm + 14} Q${x} ${arm} ${bx} ${arm}" fill="none" stroke="${t.charm}" stroke-width="3"/>
      <path d="M${bx - 6} ${arm} L${bx + 6} ${arm} L${bx + 3} ${arm + 7} L${bx - 3} ${arm + 7}Z"/>
    </g>
    <circle class="flicker" cx="${bx}" cy="${arm + 10}" r="20" fill="${t.bulbGlow}" opacity="0.3" filter="url(#soft)"/>
    <circle cx="${bx}" cy="${arm + 10}" r="3.2" fill="${t.bulb}"/>`;
}

function candles(t, xs) {
  const heights = [13, 19, 9, 16, 11, 20, 8];
  const base = H - 6;
  return xs
    .map((x, n) => {
      const h = heights[n % heights.length];
      const w = 6 + (n % 3);
      return `<circle class="flicker" cx="${x + w / 2}" cy="${base - h - 4}" r="9" fill="${t.flameGlow}" opacity="0.35" filter="url(#soft)"/>
        <rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="1.4" fill="url(#wax)"/>
        <ellipse cx="${x + w / 2}" cy="${base - h - 3.6}" rx="1.7" ry="3.4" fill="${t.flame}"/>`;
    })
    .join("");
}

function pigeon(t, x, y, s, dir) {
  return `<g transform="translate(${x} ${y}) scale(${s * dir} ${s})" fill="${t.ghost}" opacity="0.8" filter="url(#ghost)">
    <path d="M-9 0 Q-2 -7 6 -4 Q8 -8 11 -9 Q14 -9 14 -6 L17 -5 L14 -4 Q12 0 6 2 Q-2 5 -9 0Z"/>
    <path d="M-9 0 L-16 -3 L-15 2Z"/>
    <path d="M1 3 L0 7 M4 3 L4 7" stroke="${t.ghost}" stroke-width="1"/>
  </g>`;
}

function noirScene(t) {
  const reflections = buildings
    .filter(({ k }) => k % 2 === 0)
    .map(({ x, h, hot }, n) => {
      const len = 6 + h * 0.35;
      return `<line x1="${f(x + BW / 2)}" y1="${HORIZON + 3}" x2="${f(x + BW / 2)}" y2="${f(HORIZON + 3 + len)}" stroke="${hot ? t.hot : n % 5 === 0 ? t.warm : t.window}" stroke-width="3" opacity="${hot ? 0.45 : 0.2}" filter="url(#smear)"/>`;
    })
    .join("");
  return `
    <rect width="${W}" height="${HORIZON}" fill="url(#sky)"/>
    <ellipse class="pulse" cx="${W / 2}" cy="${HORIZON - 16}" rx="280" ry="70" fill="${t.fog}" opacity="0.3" filter="url(#blur)"/>
    ${towerLayer(t, 5, t.farTower, 68, 104, 34, 58, 0.1, 0.3)}
    <rect y="${HORIZON - 75}" width="${W}" height="75" fill="url(#fog)"/>
    ${towerLayer(t, 17, t.midTower, 40, 76, 24, 44, 0.3, 0.6)}
    <rect y="${HORIZON - 38}" width="${W}" height="38" fill="url(#fog)" opacity="0.7"/>
    ${noirSkyline(t)}
    <rect y="${HORIZON}" width="${W}" height="${GROUND}" fill="url(#ground)"/>
    <line x1="0" y1="${HORIZON + 1}" x2="${W}" y2="${HORIZON + 1}" stroke="${t.window}" stroke-width="1" opacity="0.25"/>
    ${reflections}
    <g stroke="${t.midTower}" stroke-width="3" opacity="0.9"><line x1="${W / 2 - 60}" y1="${HORIZON}" x2="-60" y2="${H}"/><line x1="${W / 2 + 60}" y1="${HORIZON}" x2="${W + 60}" y2="${H}"/></g>
    <ellipse cx="${W / 2}" cy="${HORIZON + 34}" rx="160" ry="11" fill="${t.window}" opacity="0.1" filter="url(#soft)"/>
    ${charmWire(t)}
    ${lamppost(t, 22, 1)}
    ${candles(t, [52, 61, 70, 81, 92, 103, 117])}
    ${candles(t, [706, 718, 729, 740, 753, 765, 778])}
    ${pigeon(t, 330, 196, 0.85, 1)}
    ${pigeon(t, 560, 204, 0.75, -1)}
    ${pigeon(t, 455, 186, 0.6, 1)}
    <rect width="${W}" height="${H}" fill="url(#vignette)"/>`;
}

// ====== card ============================================================

function render(t) {
  // Horizontal cut-outs in the lower half of a banded sun.
  const sunBands = Array.from({ length: 6 }, (_, k) =>
    `<rect x="0" y="${f(SUN.cy - 32 + k * 6.8)}" width="${W}" height="${f(1.2 + k * 0.8)}" fill="#000"/>`,
  ).join("");
  const stops = (colors) =>
    colors.map((c, k) => `<stop offset="${(k / (colors.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("");
  const shadow = t.shadow ? ' filter="url(#shadow)"' : "";
  const stat = (x, label, value, sub, glowId, size) => `
    <text x="${x}" y="28" class="label"${shadow}>${label}</text>
    <text x="${x}" y="${28 + size}" class="value" font-size="${size}" filter="url(#${glowId})">${value}</text>
    <text x="${x}" y="${44 + size}" class="sub"${shadow}>${sub}</text>`;

  const noirDefs =
    t.scene === "noir"
      ? `<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.fog}" stop-opacity="0"/><stop offset="1" stop-color="${t.fog}" stop-opacity="0.32"/></linearGradient>
    <linearGradient id="wax" x1="0" y1="0" x2="1" y2="0">${stops(t.candle)}</linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
    <filter id="soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="smear" x="-300%" y="-20%" width="700%" height="140%"><feGaussianBlur stdDeviation="1.2 3"/></filter>
    <filter id="ghost" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      : `<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">${stops(t.sun)}</linearGradient>
    <mask id="bands"><rect width="${W}" height="${H}" fill="#fff"/>${sunBands}</mask>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${login}: current streak ${current.len} days, longest ${longest.len} days, ${cal.totalContributions} contributions in the last year">
  <style>
    text { font-family: ${t.font}; text-anchor: middle; }
    .label { font-size: 10.5px; letter-spacing: ${t.labelSpacing ?? 3}px; fill: ${t.label}; font-weight: 600; }
    .value { font-weight: ${t.italic ? 800 : 700}; font-style: ${t.italic ? "italic" : "normal"}; fill: ${t.value}; }
    .sub { font-size: 10.5px; fill: ${t.sub}; }
    .pulse { animation: pulse 4s ease-in-out infinite; }
    .flicker { animation: flicker 2.6s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.85; } }
    @keyframes flicker { 0%, 100% { opacity: 0.35; } 40% { opacity: 0.5; } 60% { opacity: 0.28; } }
    @media (prefers-reduced-motion: reduce) { .pulse, .flicker { animation: none; } }
  </style>
  <defs>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="14"/></clipPath>
    <clipPath id="above"><rect width="${W}" height="${HORIZON}"/></clipPath>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops(t.sky)}</linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">${stops(t.ground)}</linearGradient>
    ${t.haze ? `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.haze}" stop-opacity="0"/><stop offset="1" stop-color="${t.haze}" stop-opacity="0.35"/></linearGradient>` : ""}
    ${t.shadow ? `<filter id="shadow" x="-10%" y="-40%" width="120%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="${t.shadow}" flood-opacity="0.85"/></filter>` : ""}
    ${noirDefs}
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
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
    ${t.scene === "noir" ? noirScene(t) : synthScene(t)}

    ${stat(190, "TOTAL · 1 YEAR", num(cal.totalContributions), `best day ${fmt(best.date)} · ${best.contributionCount}`, "glow", 30)}
    ${stat(W / 2, "CURRENT STREAK", plural(current.len, "day"), range(current), "glow-center", 36)}
    ${stat(W - 190, "LONGEST STREAK", plural(longest.len, "day"), range(longest), "glow", 30)}
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
