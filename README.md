# Online Battle City Remake

Battle City (1985) remake with online multiplayer

Deployed - https://battle-city-remake.online

Play (GitHub Pages) - https://r-bit-rry.github.io/battle-city-remake/

Server - https://github.com/miliereya/batte-city-remake-server

## Features
-  Render based on React Components
-  Multiplayer
-  Custom settings for more fun
-  Frame based controller
-  Mobile version
-  10+ satisfied friends

## AI

The "1 PLAYER + AI" mode gives player 2 to the computer. Four tiers
(`beginner`, `intermediate`, `pro`, `elite`) and three roles (`guardian`,
`wingman`, `hunter`) are selected in SETTINGS. Tiers differ in aim, pathfinding,
reaction and goal scores; roles differ in what the AI protects: the flag
(guardian), the player (wingman) or enemies (hunter).

Measured with seeds 1/7/42 over 3000 ticks (`wingman`), the tiers score
**2150 / 2157 / 3264 / 3406** for beginner / intermediate / pro / elite. The
7-point gap between the first two is inside seed noise, so tier ordering is
reliable only at the top: treat beginner and intermediate as roughly equal.
Counting runs that ended with the flag still up (a run also ends when the AI
runs out of lives or reaches the tick cap): on `pro` wingman 3/3, guardian 1/3,
hunter 2/3; on `elite`, guardian 3/3 and hunter 1/3. No role is reliable across
tiers yet; the wingman is the most consistent.

Known limits, not fixed yet:

-  Base survival by role is still seed-dependent: guardian and hunter keep the
   flag on 1–3 of 3 seeds depending on tier and seed. Five mechanisms were
   measured for this in wave B; none reached 3/3 on all roles/seeds (see
   `.superpowers/sdd/2026-10-22-ai-v3-sim-and-strategy/fix-wave-b-report.md`).
-  The AI parks near a stationary player at a fixed support rally. Removing
   that parking (wave D) dropped `pro:wingman` base survival from 9/10 to 4/10,
   so the parking is load-bearing and was reverted (`fix-wave-d-report.md`).
-  The simulator is node-only: `src/engine/sim` must not be imported by the
   app. It replaces `Math.random` globally while it runs, so it cannot run
   beside anything else that needs the real one.

Reproduce the numbers (node, no browser):

```sh
npm run sim -- --seeds 1,7,42 --ticks 3000 \
  --policies "beginner:wingman,intermediate:wingman,pro:wingman,elite:wingman"
```

`npm run bench` runs the AI benchmark instead. It takes 15+ s and its numbers
depend on the machine, so it is deliberately not part of CI; CI runs the unit
tests. The bench is green (0 `it.fails`) at the time of writing.
