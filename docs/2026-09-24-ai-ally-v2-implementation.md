# P2 Ally AI v2 — Implementation Record

Date: 2026-09-24
Design spec: `docs/superpowers/specs/2026-09-24-ai-ally-v2-design.md`
Plan: `docs/superpowers/plans/2026-09-24-ai-ally-v2.md`
Status: implemented; build green; 72 default tests pass with the 3-test soak gated
behind `npm run bench` (3/3 green); manual QA pending

## What was built

1. **Two-layer utility brain** — `aiFrameLogic` builds a pure snapshot each frame,
   computes threat scores and a predicted-bullet danger map, re-scores six goals every
   `decisionInterval` frames with role-weighted utilities and 1.15x hysteresis, then
   executes the current goal per frame through tactics (dodge → fire → brick drill →
   movement).
2. **Six goals** — `defend`, `engage`, `collect`, `support`, `retreat`, `patrol`, each
   with a target and optional enemy/bonus; `support`/coordination/prediction are gated
   by tier capabilities.
3. **Four capability-gated tiers** — `beginner/intermediate/pro/elite` (labels `0..3`):
   greedy → BFS → A* → A*+drill pathing, plus scaling reaction/accuracy/fire/dodge.
4. **Three roles** — `guardian/wingman/hunter` as pure goal-weight presets, with patrol
   anchor and composed retreat threshold; default `wingman`.
5. **Coordination + etiquette** — player-intent inference (pushing/holding/retreating/
   dead) drives cover/regroup; bonus yielding, never fire through the player, lane
   yielding, brick shots only when the plan or an escape requires it.
6. **Cost-aware lane A*** — open 1, brick 3, stone/water/flag ∞, danger penalty; brick
   drill plan invalidated on map-signature change; greedy/BFS for lower tiers.
7. **Predictive tactics** — bullet-ray dodge with tier horizon, block-when-boxed fire,
   escape-brick shots, bullet-speed aim lead, solution-driven fire with tolerance +
   jitter and cooldown (no per-frame RNG gate), 6-frame anti-stuck with second-failure
   re-score.
8. **UI + plumbing** — SETTINGS gains `AI ROLE (…)` as the 5th of 8 rows; sidebar shows
   `AI <R><tier>` (e.g. `AI W2`); `aiRole` threaded through `Game`, provider and menu.
9. **Verification** — 72 default tests across 11 files plus a gated 3-test soak,
   including 6 game-shaped scenarios and seeded soak benchmarks; benchmarks exposed a
   latent LOS bug that was fixed.

## Design decisions

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| 1 | Utility-AI core with a per-frame tactical layer | One brain to test/tune; roles become weight presets; micro-behaviors blend (dodge while escorting) | Behavior tree (state explosion, hard blending); algorithm-per-tier (4 brains to tune, minimax expensive) |
| 2 | Tiers = capability unlocks + parameter scaling | Tiers read as clearly different without the "dumb" cliff of pure unlocks or the sameness of pure scaling | Execution-quality-only; unlock-only |
| 3 | Selectable `AI ROLE` (guardian/wingman/hunter) orthogonal to tier | Genuine feature; cheap once utilities exist | No roles; role implied by tier |
| 4 | Ally complements player intent (push/hold/retreat/dead) | Research-backed companion design; keeps the base covered | Fixed escort; independent defender |
| 5 | Polite team player etiquette | Ally must never feel like a griefer | Pragmatic optimizer; configurable courtesy (extra UI) |
| 6 | Fire becomes solution-driven with accuracy jitter and a cooldown, not a per-frame RNG gate | Tiers should look sloppy, not broken; removes "refused to shoot" moments | Keep `Math.random() < fireChance` |
| 7 | A* on the lane grid with brick cost and danger penalty; brick-drill plan | Opens sealed routes; aligns with the proven A* bot | BFS-only; greedy fallback only |
| 8 | Prediction for dodge/aim gated by tier | Core observable skill difference; cheap to compute | Same reactive dodge for all tiers |
| 9 | Goal commitment with hysteresis | Prevents target oscillation that plagued v1 | Re-score and switch every decision tick |
| 10 | Internal tier keys stay `beginner/intermediate/pro/elite` | No churn in types, menu persistence or tests; labels remain numeric `0..3` | Rename keys to recruit/soldier/veteran/elite |
| 11 | Scenario suite + seeded soak benchmarks as the acceptance gate | Round 3 showed feel-based tuning misleads; ordering assertions make tiers testable | Manual QA only; unit tests only |
| 12 | Online server untouched | Server owns its engine copy; AI runs client-side only | Mirror now |

## Implementation map

### AI modules (`src/engine/logics/ai/`)

- `ai.types.ts` — all contracts: `AiGoalKind`, `AiGoal`, `AiTierFeatures`, `AiRoleProfile`,
  enemy/bullet/bonus/player/obstacle snapshots, `AiSnapshot`, `Threat`, `DangerMap`,
  `LanePath`, `AiMemory`, `AiDecision`; re-exports `TypeAiLevel`, `TypeAiRole`,
  `BusyCoordinates`. `AiObstacleSnapshot.flag` (`:98`) distinguishes the base flag.
- `ai.profiles.ts` — `AI_TIER_FEATURES` (capability unlocks + scaling constants),
  `AI_ROLE_PROFILES` (six weights, patrol anchor, retreat offset), `AI_TIER_LABELS`
  (`0..3`), `retreatLives` (`:137`).
- `ai.perception.ts` — `FLAG_X/FLAG_Y = 103/7`, `GUARD_Y = 31` (`:15-18`),
  `createMemory` (`:20`), `inferPlayerIntent` from the 60-frame track (`:36`),
  `buildSnapshot` (`:60`) with the rolling map signature, spawning-enemy filter, and
  `flag: object.type === 'FLAG'` marking (`:117`).
- `ai.threat.ts` — `computeThreats` (`:92`) implements the 0.4 proximity / 0.2 type /
  0.2 LOS / 0.1 carrier / 0.1 aiming formula; `hasLineToBase` (`:63`) samples a ray that
  skips flag obstacles via `obstacleAt(..., ignoreFlag = true)` (`:47`); `predictedHit`
  (`:114`), `findIncomingBullet` (`:135`), `buildDangerMap` (`:167`), `isCellDangerous`
  (`:190`).
- `ai.path.ts` — `LANES` (50x50 lane grid), min-heap A* with open cost 1 / brick cost 3 /
  hard blocks ∞, optional danger penalty and `ignoreId`; returns `LanePath` with the
  first drill-required lane cell.
- `ai.brain.ts` — `bonusValue` by type/state (`:30`); `defendGoal` (`:66`) accepts an
  in-radius enemy or a line-of-sight threat within `baseDangerRadius * 1.4` (`:16`) and
  intercepts southbound rushers above `GUARD_Y`; `engageGoal` (`:104`), `collectGoal`
  with yield etiquette (`:157`), `supportGoal` from intent (`:220`), `retreatGoal`
  (`:270`), `patrolGoal` per role anchor (`:288`), `selectGoal` applying role weights and
  the 1.15x commitment rule (`:304`).
- `ai.tactics.ts` — axis mapping (`:27`), `canStep` (`:45`), and `decideTactics` (`:224`):
  predicted-ray dodge with perpendicular safety (`:237`), aligned block-bullet fire
  (`:259`), escape-brick (`:278`), fallback retreat along the bullet axis (`:292`),
  lead + tolerance/jitter fire inside `engageRange` (`:308`), path brick drill (`:332`),
  waypoint following (`:357`) with greedy `chooseDirection` fallback (`:192`).

### Orchestrator

- `src/engine/logics/ai.logic.ts` — `aiFrameLogic(game)` (`:17`) keeps the v1 entry
  signature and writes `game.p2Controls`; per-frame pipeline: guard on `p2`/`aiLevel`,
  clear controls when paused/dead, `WeakMap`-stored memory (`:12`), busy list, fire
  cooldown, danger map, stale-goal invalidation, goal re-score on `decisionInterval`,
  path rebuild on map-signature change (with `ignoreId` for targets/patrol anchors and a
  danger penalty), `decideTactics`, then anti-stuck detection (6 frames without
  displacement, second failure forces a re-score) (`:113-140`). The v1 exports
  (`findLanePath`, `selectAiTarget`, `AI_PROFILES`) were removed.
- `src/engine/logics/index.ts:19` — `aiFrameLogic(game)` runs before `playersFrameLogic`,
  so the AI command bus is consumed by the normal player logic.

### Engine / provider / menu / sidebar wiring

- `src/engine/types/game.types.ts:11` — `TypeAiRole = 'guardian' | 'wingman' | 'hunter'`.
- `src/engine/instances/game.instance.ts:70,79,84` — optional `aiRole` field and 7th
  constructor argument.
- `src/engine/index.ts:14,19` — exports `TypeAiRole` and `AI_TIER_LABELS` from the barrel.
- `src/components/game-provider.tsx:27-33,58-77` — `startLocalGame` forwards an optional
  trailing `aiRole` to the `Game` constructor.
- `src/hooks/useMenu.ts` — `AI_ROLES` list (`:20`); 8 SETTINGS rows with
  `AI ROLE (…)` fifth (`:37-46`); `aiRole` state (`:64`), `cycleAiRole` (`:135`), settings
  Enter cases 5–8 (`:212-244`); `1 PLAYER + AI` starts with level + role (`:167-173`).
- `src/components/sidebar.tsx:37-38` — P2 label `AI <R><tier>` (e.g. `AI W2`), falling
  back to `wingman`; `2P` unchanged for a human partner.

## Tier matrix

From the spec (capability unlocks + scaling):

| Feature | 0 beginner | 1 intermediate | 2 pro | 3 elite |
|---|---|---|---|---|
| Pathing | greedy steer | lane BFS | A* + danger cost | A* + brick drilling |
| Aim tolerance | ±3px | ±5px | ±8px | ±8px |
| Aim lead | none | none | bullet-speed lead | bullet-speed lead |
| Aim jitter | ±6px | ±4px | ±2px | ±1px |
| Fire cooldown | 45f | 30f | 12f | 12f |
| Decision interval | 12f | 8f | 4f | 4f |
| Dodge | none | reactive (12f horizon) | predicted ray (45f) + escape brick | predicted ray (45f) + escape brick + block-when-boxed |
| Base defense | small radius, nearest | radius + nearest | threat-ranked + interception within 1.4× danger radius | same, larger radius + block-when-boxed |
| Bonus logic | none | safe only | type/state valuation | + yield etiquette + timed HELMET/TIMER/GRENADE |
| Coordination | follow p1 | follow p1 | cover opposite lane | intent inference + chokepoint cover + regroup |
| Brick drilling | no | no | yes | yes |
| Retreat threshold | early (≤2 lives) | early (≤2 lives) | late (≤1 life) | late (≤1 life) |

`baseDangerRadius` keeps the v1 values (56/72/96/110); tiers 0–1 keep a chase leash
(72/80px), tiers 2–3 have none. The T0/T1 "follow p1" rows are the `patrol` goal anchored
to the player (`support` is gated to T2+).

Bench tuning (Task 9, commits `8dd09cd` + `f3fdb56`) changed pro to
`decisionInterval 4`, `fireCooldown 12`, `aimTolerance 8`, `aimJitter 2`,
`dodgeHorizon 45`, and the wingman `defend` weight `1.2 → 1.8`. Final values live in
`ai.profiles.ts`.

## Role matrix

From the spec (weight presets on the same brain; no separate code paths):

| Goal | guardian | wingman (default) | hunter |
|---|---|---|---|
| defend | 2.0 | 1.2 (tuned to 1.8) | 0.8 |
| engage | 0.6 | 1.0 | 1.6 |
| collect | 0.7 | 1.0 | 1.3 |
| support | 0.8 | 1.5 | 0.7 |
| patrol anchor | base | player | mid-map |
| retreat threshold | one tier step earlier | tier value | one tier step later |

## Benchmarks (Task 9, final post-LOS-fix numbers)

Fixed seeds `[1, 7, 42]`, 3000 frames, wingman tier runs (test 1; elite also test 3):

| Tier | Seed | Score | baseAlive | survived | kills | nearBaseRatio |
|---|---|---:|---|---:|---:|---:|
| beginner | 1 | 708 | false | 1158 | 1 | 0.386 |
| beginner | 7 | 2146 | true | 1896 | 5 | 0.632 |
| beginner | 42 | 2152 | false | 2352 | 6 | 0.784 |
| intermediate | 1 | 1186 | false | 1586 | 2 | 0.463 |
| intermediate | 7 | 709 | false | 1209 | 0 | 0.403 |
| intermediate | 42 | 2039 | false | 2239 | 6 | 0.746 |
| pro | 1 | 1140 | true | 1090 | 1 | 0.219 |
| pro | 7 | 2846 | false | 2796 | 11 | 0.436 |
| pro | 42 | 986 | false | 1386 | 2 | 0.277 |
| elite | 1 | 1140 | true | 1090 | 1 | 0.219 |
| elite | 7 | 2568 | true | 2168 | 8 | 0.266 |
| elite | 42 | 1922 | true | 1822 | 2 | 0.464 |

Per-tier composite averages: beginner **1668.7**, intermediate **1311.3**,
pro **1657.3**, elite **1876.7**. Assertion margins: elite − beginner **208.0**,
pro − intermediate **346.0**, elite − pro **219.3**; the beginner→intermediate
adjacency check (`avg[i] >= avg[i-1] - 400`) has only **42.7** points of headroom.

Pro role runs (test 2; both roles asserted base-alive on all three seeds):

| Role | Seed | Score | baseAlive | survived | kills | nearBaseRatio |
|---|---|---:|---|---:|---:|---:|
| guardian | 1 | 3400 | true | 3000 | 8 | 0.714 |
| guardian | 7 | 1873 | true | 1673 | 4 | 0.429 |
| guardian | 42 | 3309 | true | 2759 | 11 | 0.659 |
| hunter | 1 | 1773 | true | 1423 | 7 | 0.252 |
| hunter | 7 | 1514 | true | 1414 | 2 | 0.215 |
| hunter | 42 | 1633 | true | 1583 | 1 | 0.373 |

Guardian `nearBaseRatio` average **0.6007** vs hunter **0.2800**. Elite test 3:
`baseAlive` true on all seeds, `friendlyFire` 0 across all 21 runs, `stuckRatio` 0.0000
everywhere.

These ratios were recorded with the constant `FRAMES` as the denominator: the metric
now divides by frames actually survived, so ratios run higher for runs that end early
(see Verification).

### LOS bug found and fixed during benchmarking

The first benchmark round found the guardian losing the base on 2/3 seeds despite the
highest near-base time. The `hasLineToBase` arm of threat scoring turned out to be **dead
code in real maps**: `MapInstance()` places four FLAG objects at `(96,0)`, `(96,8)`,
`(104,0)`, `(104,8)`, they are impassable and `blocksBullets`, and each `obstacleAt`
box (`x-2..x+9`, `y-2..y+9`) covers the last ray sample before the flag center
`(103,7)`, so the ray always ended inside a flag box. Measured: zero threats with
`hasLineToBase === true` across 6,653 soak frames, making the 0.2 LOS term inert.

Fix (commit `022e066`): `AiObstacleSnapshot` gained `flag: boolean`, perception marks
`FLAG` objects, and `obstacleAt` skips flag obstacles only for the base-line ray;
danger-map and bullet-impact rays still treat flags as blocking, so bullets can destroy
the flag. With LOS live, the guardian's existing `baseDangerRadius * 1.4` line-defense
band activated and base survival went to guardian 3/3 and hunter 3/3 without further
tuning; a regression test asserts that the real base structure is transparent for the
LOS ray but the two stones at tiles `(12,8)/(13,8)` still block it.

## Verification

Commands run on the fix-wave tree, with the soak gated behind `AI_BENCH=1`:

| Command | Result |
|---|---|
| `npm test` | **11 files / 72 tests passed, 1 file / 3 tests skipped (soak gated, 75 total)**, exit 0; vitest 5.96s |
| `npm run bench` | **3 soak tests / 21 runs passed**; 558.26s (9:19) |
| `npm run build` | exit 0; tsc + vite, 228 modules, built in 1.40s |
| `npx eslint <changed files>` | exit 0; 0 errors, 0 warnings |

The soak no longer runs inside `npm test`; it is gated by `AI_BENCH=1` and run with
`npm run bench`. The gated command measured 558.26s on the fix-wave tree (test 1
115.2s, test 2 390.8s, test 3 51.7s), matching the historical in-suite total.

Lint warning baseline (unchanged by this work): `useAudio.ts:53`, `useEditorKeys.ts:45`,
`useMenu.ts:120`, `useMenu.ts:341`.

## Test coverage highlights

- **Profiles (6)** — a profile per tier, monotonic reaction/accuracy scaling, capability
  gates (`brickDrilling`, `coordination`, `yieldBonuses`, `blockBullets`), six weights per
  role, guardian-vs-hunter contrast, composed `retreatLives`.
- **Perception (5)** — enemy/bullet/bonus/obstacle capture with speed and carrier flags;
  spawning enemies ignored; map signature changes when a brick disappears; pushing/
  holding/retreating/dead and 1-life intent inference.
- **Threat (7)** — speedy carrier ranks above a distant normal tank; aiming-at-player
  detection; LOS lost behind a stone wall; regression: LOS reaches the flag past the real
  base structure but not past a wall; predicted bullet impact; danger lane marking and
  decay; obstacle cut-off.
- **Path (5)** — straight lane path, detour when drilling is off, drill when cheaper,
  sealed-by-stone returns null, ignored target cell reachable.
- **Brain (8)** — bonus valuation by tank level/lives and disabled logic; base defense
  over a nearer enemy; goal retention while close; stale enemy goal dropped; elite yields
  a contested bonus to the closer player; hunter engages while guardian patrols; goal
  validity.
- **Tactics (9)** — axis semantics; perpendicular dodge; fire on an aligned enemy in
  range; never fire through the player or a brick wall; hold at the goal; waypoint
  following; fire at a brick the path needs opened; escape-brick fire gated on cooldown.
- **Scenarios (6)** — base-rush defense, brick-wall drilling to a sealed target, cover
  while the player pushes, base guard when the player is out of lives, 1v1 duel kill,
  guardian regroup when hurt and outnumbered.
- **Bench (3)** — tier composite ordering with tolerance and strict separations; guardian
  closer to the base than hunter with both base-alive; elite never friendly-fires, never
  wedges (`stuckRatio < 0.05`) and never loses the base.
- **Orchestrator (5)** — no-op without `aiLevel`; controls cleared while paused/dead; goal
  caching and invalidation after a kill; bullet dodge; long beginner soak.
- **Engine + menu** — lane snapping and respawn regressions; `aiRole` stored/defaults to
  none; cursor geometry on 8 settings rows; `AI ROLE (WINGMAN)` shown and cycled.

## Known limitations / follow-ups

- **Bench runtime** — the ~9-minute soak (role test alone ~6.4 min) no longer runs in
  `npm test`; it is gated behind `AI_BENCH=1` and runs via `npm run bench`. Vitest
  timeouts still cannot interrupt the synchronous loop, so a hang in `gameFrame` would
  wedge the bench command; run it outside CI or reduce `FRAMES` for CI.
- **Thin beginner→intermediate adjacency margin** — intermediate averages 357.3 below
  beginner, leaving only 42.7 points before the `-400` allowance fails. `elite > beginner`
  (+208.0) and `pro > intermediate` (+346.0) are comfortable.
- **Elite/pro margin** — elite leads pro by 219.3 on average, but the two are bit-for-bit
  identical on seed 1 (both 1140) and elite's lead comes from seed 7; only the tolerance
  check protects this adjacency.
- **Wingman base losses remain** — pro loses the base on seeds 7 and 42, beginner and
  intermediate on most seeds; only the role and elite tests assert base survival.
- **Untested variants from the ledger** (`progress.md`): capability-gating assertions are
  one-sided for `dodgeHorizon`/`pathfinding`; `PLAYER_TRACK_SIZE` cap, danger-decay merge
  order and the path danger-penalty branch are untested; HELMET/GRENADE/TIMER bonus arms
  and intercept/support/retreat variants lack direct tests; `isDirectionSafe` has no
  obstacle cut-off and the dead null-step branch is untested; one scenario's brick-count
  cannot attribute removal to the AI; `cycleAiRole('-')` and the `guardian` menu state
  are untested (backwards cycle is UI-unreachable).
- **Interface change** — `AiObstacleSnapshot.flag` is a new required field; only
  `ai.perception.ts` constructs it in this repo, but external consumers of the type need
  it.
- **Base-line rays skip flags only** — protective bricks still block LOS by design, so
  the threat's LOS term mirrors real bullet lanes rather than intent.

## Manual QA checklist

- AI LEVEL 0 vs 3 feel clearly different (reaction, aim, dodging, brick drilling).
- GUARDIAN holds base, HUNTER roams, WINGMAN shadows the player.
- Ally yields a bonus when the player is closer (elite) and takes it otherwise.
- Ally drills a brick only when the route requires it.
- Ally covers the base while the player pushes; guards when the player is out.
- No friendly fire across a full level; ally never blocks the player in a corridor.
- 2P mode unchanged; SETTINGS has 8 rows and the cursor stays aligned.
