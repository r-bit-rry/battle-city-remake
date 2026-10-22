# AI v3 — simulator, perf, strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the AI partner fast, non-spinning and strategic, with a headless simulator that can speedrun and A/B two policies on the same seeds.

**Architecture:** One tick is `gameFrame(game)`. The simulator wraps that in a seeded, headless runner and reports metrics (score components + frame-time percentiles); it never touches app code, so browser and sim share one engine. Strategy work stays inside `src/engine/logics/ai/`: perception/threat/path get cheaper per tick, tactics get commitment and long-range fire, the brain gets a base-alert override and terrain-aware brick drilling.

**Tech Stack:** TypeScript, vitest (`src/**/*.test.ts`, jsdom by default, `// @vitest-environment node` for sim), `vite-node` (already installed) for the CLI. No new dependencies.

**Spec:** none — this plan is the design authority. Behaviour decisions below were ruled in the design conversation; the numbers in `Review Focus` are the contract.

## Global Constraints

- No new npm dependencies. CLI runs through `vite-node`.
- `gameFrame(game)` signature and semantics in `src/engine/logics/index.ts` stay unchanged; `src/engine/logics/players.logic.ts` is not modified (turning without moving is the engine's documented behaviour — the AI must cope).
- The sim is node-only: it may replace `Math.random` globally, but must restore the original in `dispose()` and in a `finally`.
- Every behaviour change ships with an A/B number from `npm run sim` in its report (policy before vs after, same seeds).
- A benchmark assertion that currently fails is marked `it.fails` by W0 and flipped back to `it` in the same commit that makes it pass — never left as `it.fails` while green.
- Tests: `npx vitest run`; sim benchmarks: `AI_BENCH=1 npx vitest run src/engine/logics/ai/ai.bench.test.ts`.
- Commit style: `feat(ai):` / `perf(ai):` / `fix(ai):` / `test(ai):`, one task per commit range.

## Review Focus

- Two runs with the same seed must produce identical metrics — no `Math.random`, no `Date.now` on the AI path.
- A blocked AI must not alternate directions on consecutive ticks (the reported spin), and must never sit still for more than 12 ticks.
- An enemy in a clear firing lane at 120 px must draw fire; a friendly in that lane must not.
- Two enemies closing on an exposed flag must outrank a bonus pickup, at every tier and role.
- Frame cost must stay flat as enemy count rises: p99 under 8 ms in node for 3000 ticks.

---

### Task 1 (W0): Deterministic simulator + A/B harness

**Files:**
- Create: `src/engine/sim/sim.ts`, `src/engine/sim/ab.ts`, `src/engine/sim/cli.ts`
- Create: `src/engine/sim/sim.test.ts`, `src/engine/sim/ab.test.ts`
- Modify: `src/engine/logics/ai/ai.bench.test.ts` (rewrite on top of the sim), `package.json` (one script)

**Interfaces:**
- Consumes: `gameFrame(game: Game): void`, `Game` constructor `(id, p1, p2, settings, editor?, aiLevel?, aiRole?)`.
- Produces:
  - `interface SimOptions { tier: TypeAiLevel; role: TypeAiRole; seed: number; settings: Partial<GameSettings>; playerIdle: boolean }`
  - `interface SimMetrics { ticks: number; kills: number; baseAlive: boolean; aiAlive: boolean; stuckRatio: number; friendlyFire: number; p50Ms: number; p99Ms: number; maxMs: number; score: number }`
  - `class Sim { readonly game: Game; constructor(o?: Partial<SimOptions>); step(ticks?: number): void; runUntil(stop: (game: Game) => boolean, maxTicks: number): SimMetrics; metrics(): SimMetrics; dispose(): void }`
  - `abTest(policies: Record<string, Partial<SimOptions>>, seeds: number[], maxTicks: number): AbRow[]`
  - `formatAb(rows: AbRow[]): string` — fixed-width table, one row per policy (averages) plus per-seed rows.
  - `parsePolicies(spec: string): Record<string, Partial<SimOptions>>` where `spec` is `"elite:wingman,hunter=pro:hunter"`.

- [ ] **Step 1: Write the failing determinism test** — `src/engine/sim/sim.test.ts`, `// @vitest-environment node`

```ts
it('advances exactly the requested number of ticks', () => {
  const sim = new Sim({ seed: 7 }); const before = sim.game.frame
  sim.step(25); expect(sim.game.frame - before).toBe(25); sim.dispose()
})
it('same seed, same run', () => {
  const a = run(7), b = run(7)
  expect(a.metrics).toEqual(b.metrics)
  expect(a.aiXy).toEqual(b.aiXy)
})
it('restores Math.random on dispose', () => {
  const original = Math.random; const sim = new Sim({ seed: 3 }); sim.dispose()
  expect(Math.random).toBe(original)
})
```

`run(seed)` is a local helper: `new Sim({seed, tier:'pro', role:'wingman'})`, `step(300)`, capture `{metrics, aiXy:[game.p2.coordinateX, game.p2.coordinateY]}`.

- [ ] **Step 2: Run it, expect failure** — `npx vitest run src/engine/sim/sim.test.ts` → module not found.

- [ ] **Step 3: Implement `sim.ts`** — mulberry32; `Sim` seeds `Math.random` in the constructor and restores in `dispose()`; level start comes free from `levelFrameLogic` (map loads at `levelChangeAnimation === 60`, so advance 61 ticks before counting metrics); kills tracked by a `Set` of enemy ids seen; `stuckRatio` = ticks where `p2Controls.move !== null` and position unchanged / ticks that had a move; per-tick `performance.now()` deltas feed p50/p99/max; `p1Controls` stays `{fire:false,move:null}`.

- [ ] **Step 4: Write `ab.test.ts`** — two policies over seeds `[1, 7]` must return 4 rows, each with finite metrics; `formatAb` output contains both policy names and a header line.

- [ ] **Step 5: Implement `ab.ts` and `cli.ts`** — CLI args `--seeds 1,7,42`, `--ticks 3000`, `--policies "elite:wingman,pro:guardian"`, `--json`; prints `formatAb` by default. Add `"sim": "vite-node src/engine/sim/cli.ts"` to `package.json` scripts.

- [ ] **Step 6: Rewrite `ai.bench.test.ts` on the sim** — three cases: tier ordering, guardian-vs-hunter near-base ratio, elite safety. Keep the existing seed set `[1,7,42]` and `FRAMES = 3000`. Mark the three currently-failing assertions `it.fails` with a comment naming the task that flips them (P3 for base-alive/tier-order, P4 for the rest). Add `expect(metrics.p99Ms).toBeLessThan(8)` to a new `it('keeps frame cost flat')`.

- [ ] **Step 7: Verify** — `npx vitest run` (all green, `it.fails` counted as pass), `AI_BENCH=1 npx vitest run src/engine/logics/ai/ai.bench.test.ts`, and `npm run sim -- --seeds 1,7 --ticks 3000 --policies "elite:wingman,pro:guardian"` prints a table. Paste the baseline table in the report (Task P2 compares against it).

- [ ] **Step 8: Commit** — `git commit -m "feat(ai): deterministic headless simulator with A/B policy comparison"`

---

### Task 2 (P1): Persist menu settings

**Files:**
- Modify: `src/hooks/useMenu.ts`, `src/components/menu/menu.test.tsx`

**Interfaces:**
- Consumes: existing `GameSettings`, `TypeAiLevel`, `TypeAiRole`.
- Produces: nothing importable — behaviour only. Storage key `battle-city:settings:v1`, value `{ ...GameSettings, aiLevel, aiRole }`.

- [ ] **Step 1: Failing test** in `menu.test.tsx`: render the menu, open SETTINGS, toggle HARDCORE to `y`, unmount, render again, open SETTINGS, expect the row to read `HARDCORE (y)`. Follow the existing render/harness helpers in that file.

- [ ] **Step 2: Run it, expect failure.**

- [ ] **Step 3: Implement** — one `useState` per field with a lazy initialiser reading the key; one `useEffect` writing on change. Validate on read (trust boundary): `soundPack` in `['default','mario']`, `playerLevel` integer 0–3, booleans coerced with `=== true`, unknown `aiLevel`/`aiRole` fall back to `'beginner'`/`'wingman'`; wrap `JSON.parse` in try/catch. Delete the duplicate `settings` object (`useMenu.ts:98`) and use one `gameSettings` everywhere. Fix the effect deps at `useMenu.ts:345` so a toggled setting is not stale when starting a game (`hardcore`, `friendlyFire`, `playerLevel`).

- [ ] **Step 4: Verify** — `npx vitest run src/components/menu/menu.test.tsx` and `npx vitest run`.

- [ ] **Step 5: Commit** — `git commit -m "fix(menu): persist settings across games and reloads"`

---

### Task 3 (P2): Per-tick cost of perception, threats and paths

**Files:**
- Modify: `src/engine/logics/ai/ai.perception.ts`, `ai.threat.ts`, `ai.path.ts`, `ai.types.ts`, `ai.logic.ts`

**Interfaces:**
- Produces (later tasks rely on these):
  - `AiSnapshot.blocked: Uint8Array` — `32*32` cells of 8 px; `0` free, `1` brick, `2` solid.
  - `obstacleAt(snapshot, x, y): AiObstacleSnapshot | undefined` stays the public name and semantics.
  - `buildDangerMap(snapshot, horizon, cache?: DangerMap): DangerMap` with `DangerMap.cells: Map<number, number>` keyed by `yi*LANE_COUNT+xi`.
  - `findPath(...)` unchanged signature.
- Consumes: `LANES`, `LANE_COUNT` from `ai.path.ts`.

- [ ] **Step 1: Failing equivalence test** — `ai.threat.test.ts` (extend): for 300 pseudo-random points on a fixture map, `obstacleAt(snapshot, x, y)` returns the same truthiness as the current linear scan; and a bullet raycast into a brick still reports blocked. Keep the old scan in the test as the oracle.

- [ ] **Step 2: Failing perf test** — `ai.bench.test.ts` already asserts p99 < 8 ms after W0; record the baseline in the report before changing code.

- [ ] **Step 3: Implement the grid** — build `blocked` once in `buildSnapshot` (same reach constants as `buildGrid` in `ai.path.ts`: tanks ±14, obstacles −7/+14), rewrite `obstacleAt` as four cell lookups covering `[x-2,x+9]×[y-2,y+9]`, keep the brick/solid distinction.

- [ ] **Step 4: Implement danger caching** — in `ai.logic.ts` keep `memory.danger` and `memory.dangerKey` (bullets' `x,y,direction` joined + `mapSignature` + tick parity); recompute only when the key changes or every 3rd tick. Numeric keys replace template strings in `buildDangerMap` and `isCellDangerous`.

- [ ] **Step 5: Implement path reuse and allocation removal** — in `ai.logic.ts` keep the current path while the goal is unchanged (`goalKey = kind|enemyId|bonusId|x|y`) and the map signature matches; stop nulling it on every decision tick. In `ai.path.ts` hoist the four typed arrays and use a numeric binary heap (`Float64Array` priorities + `Int32Array` nodes) so a path search allocates nothing per call.

- [ ] **Step 6: Verify** — `npx vitest run`, then `npm run sim -- --seeds 1,7,42 --ticks 3000 --policies "elite:wingman"` twice: p99 and average must be ≤ baseline, and metrics must be identical to baseline except for allowed randomness in turn timings. If behaviour shifted, say by how much in the report.

- [ ] **Step 7: Commit** — `git commit -m "perf(ai): cell-indexed obstacles, cached danger map, allocation-free A*"`

---

### Task 4 (P3): Stop the spin, defend the flag, shoot from afar

**Files:**
- Modify: `src/engine/logics/ai/ai.tactics.ts`, `ai.logic.ts`, `ai.brain.ts`, `ai.types.ts`, `ai.scenarios.test.ts`, `ai.tactics.test.ts`, `ai.bench.test.ts`

**Interfaces:**
- Produces (P4 relies on these):
  - `AiMemory.commitDir: TypeDirection | null`, `commitTicks: number`, `noProgressTicks: number`, `baseAlertTicks: number`
  - `decideTactics(...)` unchanged signature; returns `{move, fire}`.
  - `defendGoal(snapshot, threats, features)` unchanged signature; may return score `1` for a base alert.
- Consumes: `memory` fields above, `getAiMemory` for tests.

- [ ] **Step 1: Failing spin test** — `ai.tactics.test.ts`: place the AI in a pocket (brick left/right/above, enemy below and to the side), run 60 ticks, assert the direction changes on fewer than 4 ticks and the AI's x or y differs from the start by ≥ 8. Second case: with a reachable goal 40 ticks away, assert `commitDir` survives ≥ 8 consecutive ticks.

- [ ] **Step 2: Failing behaviour tests** — `ai.scenarios.test.ts`:
  - other player standing in a clear lane with an enemy 120 px behind them: AI must not fire (friendly-fire gate stays).
  - enemy 120 px away down a clear lane, nobody between: a bullet is in flight within 3 ticks.
  - two enemies within 90 px of the flag and no other threats: `getAiMemory(game)?.goal?.kind === 'defend'` for every tier and role.

- [ ] **Step 3: Implement commitment and honest stuck detection** — in `ai.tactics.ts` wrap the returned move: if it equals `memory.commitDir` and `commitTicks > 0`, reuse; otherwise set `commitDir` and `commitTicks = 8` on a fresh choice. Only re-decide a turn when blocked, when the waypoint advanced, or when a dodge fires. In `ai.logic.ts` replace the `p2.direction === memory.lastMove` stuck condition with pure position comparison (`noProgressTicks`), sidestep after 4 unproductive ticks, drop goal after 12. Delete `stuckFrames` usage in favour of `noProgressTicks`.

- [ ] **Step 4: Implement base alert and sniping** — `ai.brain.ts`: count enemies within `baseDangerRadius * 1.5`; if ≥ 2, or 1 while the AI is > 120 px from the flag, return `{kind:'defend', x: FLAG_X, y: GUARD_Y, enemyId: nearest}` with score `1`. `ai.tactics.ts`: before the `engageRange` filter, take enemies within `SNIPE_RANGE = 140` that share a row/column within `HIT_BAND`, `shotPathClear`, no friend in line, and fire when aligned (turn toward it otherwise).

- [ ] **Step 5: Flip the bench cases this fixes** — base-alive and tier-ordering: `it.fails` → `it`. Run `AI_BENCH=1 npx vitest run src/engine/logics/ai/ai.bench.test.ts`.

- [ ] **Step 6: A/B in the report** — `npm run sim -- --seeds 1,7,42 --ticks 3000 --policies "elite:wingman,pro:guardian,hunter=elite:hunter"` and a run of the pre-P3 commit for comparison. Report stuckRatio, baseAlive, kills, score before/after.

- [ ] **Step 7: Commit** — `git commit -m "fix(ai): commit to a heading, defend an exposed flag, snipe down clear lanes"`

---

### Task 5 (P4): Shape the terrain, contest bonuses

**Files:**
- Create: `src/engine/logics/ai/ai.terrain.ts`, `src/engine/logics/ai/ai.terrain.test.ts`
- Modify: `src/engine/logics/ai/ai.tactics.ts`, `ai.brain.ts`, `ai.scenarios.test.ts`, `ai.bench.test.ts`

**Interfaces:**
- Produces:
  - `flagWall(snapshot: AiSnapshot): { bricks: number; breached: boolean }` — bricks within 24 px of `FLAG_X/FLAG_Y`, `breached` when any side has no brick between the flag and the map edge direction.
  - `drillValue(snapshot, brick: {x,y}, goal: AiGoal | null): number` — `+3` when firing at that brick opens a lane on an enemy, `+2` when it shortens the goal path (lane alignment with goal), `0` otherwise.
  - `chooseDrill(snapshot, goal, features): { x: number; y: number; direction: TypeDirection } | null` — best adjacent destructible brick, ignoring directions with the player in line.
- Consumes: `AiMemory.commitDir` (do not drill mid-commit), `obstacleAt`, `blocked`.

- [ ] **Step 1: Failing unit tests** — `ai.terrain.test.ts`: `flagWall` on the stock map reports the four-sided wall intact, and reports `breached` after removing the north-side bricks; `drillValue` ranks a brick between the AI and an enemy above a brick beside it; `chooseDrill` returns `null` when the only brick in reach has the player in line.

- [ ] **Step 2: Failing scenario tests** — `ai.scenarios.test.ts`: walled enemy down a lane with a brick in between → AI destroys the brick and kills the enemy within 200 ticks; a bonus 60 px away with an enemy 20 px closer to it → AI does not abandon a defend goal (bonus value drops, goal stays `defend`).

- [ ] **Step 3: Implement `ai.terrain.ts`.**

- [ ] **Step 4: Wire it in** — `ai.tactics.ts` brick branch calls `chooseDrill` instead of taking the first brick on the path; reserve drilling for `features.brickDrilling` and skip while `memory.commitTicks > 0`. `ai.brain.ts`: `defendGoal` returns score `1` when `flagWall(...).breached`; `collectGoal` multiplies value by `0.3` when the nearest enemy is ≥ 12 px closer than the AI instead of dropping the bonus entirely.

- [ ] **Step 4b: Fix the lane-width wedge (carried from Task 4 review)** — `ai.path.ts`: `buildGrid` marks obstacles with reach `-7/+14`, which leaves 8 px lanes a 15 px tank cannot traverse; guardian seed 42 wedges on one. Make the grid reject any lane node whose tank footprint is not clear (reuse the same reach constants as `isTankBlockedAt`, or validate each waypoint's approach with the busy list), and add a regression test: a brick corridor exactly one cell wide must not be routed through. Flip the remaining `it.fails` cases in `ai.bench.test.ts` that this fixes.

- [ ] **Step 5: Verify + A/B** — full suite, bench (flip any remaining `it.fails` this task fixes), `npm run sim` before/after with `--policies "elite:wingman,elite:guardian"`; report kills, baseAlive, score.

- [ ] **Step 6: Commit** — `git commit -m "feat(ai): drill bricks that open lanes and fight for contested bonuses"`

---

### Task 6 (G): Gate

**Files:**
- Modify: `.github/workflows/pages.yml`, `README.md`

- [ ] **Step 1:** Add `- run: npx vitest run` between `npm ci` and the build step (tests gate the deploy). Also add `searchingLobbyId` to the keypress effect deps in `src/hooks/useMenu.ts` — pre-existing bug found in Task 2 review: FIND LOBBY reads a stale empty id and never joins.
- [ ] **Step 2:** Add a `## AI` section to `README.md`: one paragraph on tiers/roles, and `npm run sim -- --seeds 1,7,42 --ticks 3000 --policies "elite:wingman"` as the way to reproduce AI numbers.
- [ ] **Step 3:** `npx vitest run` and `AI_BENCH=1 npx vitest run src/engine/logics/ai/ai.bench.test.ts` — no `it.fails` left in the bench.
- [ ] **Step 4:** Commit — `git commit -m "ci: gate deploys on tests, document the AI simulator"`
