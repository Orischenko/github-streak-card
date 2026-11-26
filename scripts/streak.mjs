// Builds assets/streak.svg (and assets/streak-graffiti.svg) from the GitHub
// contribution calendar: current and longest streak with their dates, drawn
// into assets/graffiti-template.svg. Private contributions are included when
// the token belongs to the profile owner. No dependencies.
import { readFile, writeFile } from "node:fs/promises";

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN is not set");
  process.exit(1);
}

// ---- data --------------------------------------------------------------
const query = `{
  viewer {
    login
    contributionsCollection {
      contributionCalendar {
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
const days = json.data.viewer.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);

// ---- streaks -------------------------------------------------------------
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

// Today without contributions does not break the streak until the day is over.
let i = days.length - 1;
if (i >= 0 && days[i].contributionCount === 0) i--;
const current = { len: 0, start: null, end: i >= 0 ? days[i].date : null };
while (i >= 0 && days[i].contributionCount > 0) {
  current.len++;
  current.start = days[i].date;
  i--;
}

// ---- card ----------------------------------------------------------------
const fmt = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const daysText = (n) => `${n} ${n === 1 ? "DAY" : "DAYS"}`;
const span = (s) => (s.len ? `${fmt(s.start)} - ${fmt(s.end)}` : "no streak yet");

const fill = {
  TITLE: `${login}: current streak ${current.len} days, longest ${longest.len} days`,
  CURRENT: daysText(current.len),
  CURRENT_RANGE: span(current),
  LONGEST: daysText(longest.len),
  LONGEST_RANGE: span(longest),
};

const template = await readFile(new URL("../assets/graffiti-template.svg", import.meta.url), "utf8");
const svg = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => fill[k] ?? "");

await writeFile(new URL("../assets/streak-graffiti.svg", import.meta.url), svg);
await writeFile(new URL("../assets/streak.svg", import.meta.url), svg);
console.log(`current ${current.len} (${span(current)}), longest ${longest.len} (${span(longest)})`);
