# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/theo1603/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/theo1603/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay — a complete open-world crime game in the browser: a sun-soaked procedural coastal city with a beach and working docks, explored on foot and by car. Steal and drive six vehicle types, dodge traffic and pedestrians, outrun a 1–5 star police pursuit, shoot it out with the rival Gulls crew, run five story missions for fixer Mama Lou, pick up taxi fares, and hunt ten hidden packages — with a minimap HUD, synthesised sound and music, and localStorage saves. Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step and no network: `game/` is plain static files (three.js is vendored under `game/vendor/`), so any static server works. Screenshots are staged deterministically with `?shot=cover|drive|mission|onfoot&seed=1`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
