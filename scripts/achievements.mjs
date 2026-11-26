// Fetches achievement progress from the GitHub GraphQL API and writes it
// into README.md between the ACHIEVEMENTS markers. No dependencies.
import { readFile, writeFile } from "node:fs/promises";

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("GH_TOKEN is not set");
  process.exit(1);
}

const query = `{
  viewer {
    login
    pullRequests(states: MERGED) { totalCount }
    repositoryDiscussionComments(onlyAnswers: true) { totalCount }
    sponsoring { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 1,
                 orderBy: { field: STARGAZERS, direction: DESC }) {
      nodes { stargazerCount }
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
const v = json.data.viewer;

const LEVELS = ["Default", "x2 🥉", "x3 🥈", "x4 🥇"];

const achievements = [
  { name: "🦈 Pull Shark", count: v.pullRequests.totalCount, tiers: [2, 16, 128, 1024], unit: "merged PRs" },
  { name: "🧠 Galaxy Brain", count: v.repositoryDiscussionComments.totalCount, tiers: [2, 8, 16, 32], unit: "accepted answers" },
  { name: "⭐ Starstruck", count: v.repositories.nodes[0]?.stargazerCount ?? 0, tiers: [16, 128, 512, 4096], unit: "stars on top repo" },
  { name: "❤️ Public Sponsor", count: v.sponsoring.totalCount, tiers: [1], unit: "sponsorships" },
];

function bar(value, max, width = 12) {
  const filled = Math.min(width, Math.round((value / max) * width));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function row({ name, count, tiers, unit }) {
  const reached = tiers.filter((t) => count >= t).length;
  const level = reached === 0 ? "—" : LEVELS[reached - 1];
  const next = tiers[reached];
  const progress = next
    ? `\`${bar(count, next)}\` ${count} / ${next} ${unit}`
    : `\`${bar(1, 1)}\` ${count} ${unit} · max level`;
  return `| ${name} | ${level} | ${progress} |`;
}

const date = new Date().toISOString().slice(0, 10);
const block = [
  "| Achievement | Level | Progress to next level |",
  "| --- | --- | --- |",
  ...achievements.map(row),
  "",
  `<sub>Updated automatically via the GitHub GraphQL API · ${date}</sub>`,
].join("\n");

const START = "<!-- ACHIEVEMENTS:START -->";
const END = "<!-- ACHIEVEMENTS:END -->";
const path = new URL("../README.md", import.meta.url);
const readme = await readFile(path, "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!pattern.test(readme)) {
  console.error("Markers not found in README.md");
  process.exit(1);
}
await writeFile(path, readme.replace(pattern, `${START}\n${block}\n${END}`));
console.log(block);
