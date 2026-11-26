# 🌴 GitHub Streak Card

Commit streak cards for your GitHub profile, drawn as little cityscapes and rebuilt every 6 hours by GitHub Actions.

<img src="./assets/streak.svg" alt="Commit streak card" width="100%" />

- **Current streak, longest streak and yearly total**, private contributions included.
- **A skyline of the calendar year**: one building per week from January to December, height = contributions that week, with month ticks underneath. Current-streak weeks light up, and weeks still to come stand as dark buildings with no lit windows yet.
- **Three themes**, all generated on every run.
- **Zero dependencies**: two small Node scripts and the GitHub GraphQL API.
- **Self-hosted**: the SVG lives in your repo, so no third-party card service can go down or rate-limit you.

## Themes

| Theme | Preview |
| --- | --- |
| `dusk`: pastel Miami dusk, periwinkle-to-peach sky, lilac haze | <img src="./assets/streak-dusk.svg" width="420" alt="dusk theme" /> |
| `noir`: foggy occult noir, teal-lit art-deco towers, hanging charms, street lamp, candles, ghostly pigeons | <img src="./assets/streak-noir.svg" width="420" alt="noir theme" /> |
| `americana`: golden hour over the hills, radio tower, tall palms, open road | <img src="./assets/streak-americana.svg" width="420" alt="americana theme" /> |

Every run writes all of them to `assets/streak-<theme>.svg`. `assets/streak.svg` is the default theme, set with the `STREAK_THEME` variable (`dusk` if unset).

## Use it on your profile

1. **Fork** this repository (or use it as a template).
2. **Create a token**: Settings → Developer settings → Personal access tokens → *Tokens (classic)*, scopes `repo` and `read:user`. The `repo` scope lets the card count your private contributions; skip it if you only want public ones.
3. **Add the token** to your fork: Settings → Secrets and variables → Actions → New repository secret, name `PROFILE_STATS_TOKEN`.
4. **Run the workflow** once: Actions → *Update streak card* → Run workflow. After that it runs every 6 hours.
5. **Embed the card** in your profile README (`<username>/<username>`):

   ```html
   <img src="https://raw.githubusercontent.com/<username>/github-streak-card/main/assets/streak-noir.svg" alt="Commit streak" width="100%" />
   ```

   Swap `streak-noir.svg` for any theme, or use `streak.svg` for the default one.

## Run locally

```bash
GH_TOKEN=$(gh auth token) node scripts/streak.mjs
```

The card is written to `assets/streak.svg`. Requires Node.js 18+.

## How the streak is counted

- A day counts if it has at least one contribution in your GitHub contribution calendar.
- Today without contributions does **not** break the current streak until the day is over.
- The calendar covers the last 365 days, so the longest streak is the longest one within that window.

## Bonus: achievement progress

GitHub shows which achievements you have, but not how far you are from the next tier. `scripts/achievements.mjs` fills the table below with live numbers.

<!-- ACHIEVEMENTS:START -->
| Achievement | Level | Progress to next level |
| --- | --- | --- |
| 🦈 Pull Shark | x3 🥈 | `▓▓░░░░░░░░░░` 131 / 1024 merged PRs |
| 🧠 Galaxy Brain | x3 🥈 | `▓▓▓▓▓▓░░░░░░` 16 / 32 accepted answers |
| ⭐ Starstruck | — | `▓▓░░░░░░░░░░` 2 / 16 stars on top repo |
| ❤️ Public Sponsor | Default | `▓▓▓▓▓▓▓▓▓▓▓▓` 1 sponsorships · max level |

<sub>Updated automatically via the GitHub GraphQL API · 2026-11-26</sub>
<!-- ACHIEVEMENTS:END -->

## License

[MIT](LICENSE)
