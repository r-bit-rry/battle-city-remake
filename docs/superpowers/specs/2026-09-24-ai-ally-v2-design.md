# P2 Ally AI v2 — Tiering, Roles & Tactics Design

Date: 2026-09-24
Status: approved in session; implementation pending
Scope: `1 PLAYER + AI` second-player ally only. Enemy AI is out of scope.

## Problem

The current ally AI (`src/engine/logics/ai.logic.ts`) is one behavior with four
parameter profiles. All tiers play the same game: lane-BFS to a target, fire only
when axis-aligned and `Math.random() < fireChance`, dodge only bullets already
inside a radius, and value all bonuses equally. Consequences:

1. Tiers are hard to tell apart — only reaction speed and a random fire gate differ.
2. The AI never predicts: no bullet-impact forecasting, no speed-aware aim lead
   (`leadShots` shifts a hardcoded 2px), no interception of base-rushers.
3. Fire is RNG-gated, so the AI sometimes "refuses" to shoot with a perfect solution.
4. Pathing cannot open routes: if a brick wall seals the lane graph, BFS returns
   null and the AI degrades to greedy steering into the wall.
5. Base defense is a binary radius check with no threat ranking or interception.
6. Bonuses have no type/state valuation and no etiquette toward the human.
7. No coordination: the ally either follows the player or chases, never covers the
   front the player abandoned.
8. No anti-wedge recovery beyond invalidating the path; two tanks can pin it.

## Research basis

| Source | Finding | Used for |
|---|---|---|
| Battle City (Famicom 1985) ROM reverse-engineering notes (`vgrichina/battlecity`, `romhack/battle-city-disassembly`) | Enemy AI is a phase machine: chase eagle → random wander → chase player, PRNG-driven; blocked enemies flip 180° 25% of the time; fire chance ≈ 1/32 per frame; no entity-entity collision | Phase idea informs goal set; blocked-flip informs anti-stuck sidestep |
| AI-Battle-City A* bot (`munhouiani/AI-Battle-City`, cited by the RL paper below) | Threat radius of ~150px around the base picks the defend target; cost-aware A* with a Manhattan heuristic; explicit bullet-avoidance tiers: shoot head-on bullets when very close, sidestep within ~25px, otherwise keep the path direction but never step into the bullet's lane; fire only when inline | Threat scoring, danger map, layered dodge, inline fire |
| Stanford CS221 "AI Agent for the Battle City" | Learned agents survive by passivity but fail to defend the base; action space must be specific (agents shoot indestructible tiles); human oracle far ahead | Base-first utility, wall-clear fire gating, brick only if destructible |
| Tiered academic clones (`fahadjavaid114/BattleCity-AI-Project` and siblings) | Distinct behaviors per tier: BFS reflex → greedy (local minima) → A* that drills bricks and retreats when damaged → minimax boss | Tier ladder = unlocks + scaling (not 4 brains) |
| PUBG Ally (KRAFTON/NVIDIA) | Teammate = fast behavior layer (movement, aim, combat) + slower cognitive layer (strategy, commands) | Two-layer brain: utility goal selection + per-frame tactics |
| "Complementary Companion Character Behavior" (arXiv 1808.09079) | Good companions complement the player's predicted action instead of mirroring it | Player-intent inference + coverage goal |
| StrategyWiki / GameFAQs | Power-up semantics: GRENADE clears the screen, HELMET shields, TIMER freezes, STAR upgrades, HP +1 life; SPEEDY threatens the base, HEAVY takes multiple hits; bonus carriers are the 4th/11th/18th spawns | Bonus valuation by type/state; threat type weights; carrier priority |

DeepWiki has no indexed Battle City repositories and the Reddit API was
unavailable during research; primary sources above were used instead.

## Decisions

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

## Architecture

Modules under `src/engine/logics/ai/`:

| Module | Responsibility | Depends on |
|---|---|---|
| `ai.types.ts` | `TypeAiRole`, `AiGoalKind`, `AiGoal`, `AiProfile`, `AiSnapshot`, `Threat`, `DangerMap`, `AiMemory` | engine types |
| `ai.profiles.ts` | Tier parameter table, feature gates, role weight presets | `ai.types.ts` |
| `ai.perception.ts` | Pure snapshot of the game: enemies (id, x, y, dir, type, speed, carrier, lives, shots), bullets (x, y, dir, speed, side), bonuses, player (position, direction, lives, recent displacement), base state, impassable map, map signature | instances, utils |
| `ai.threat.ts` | Per-enemy threat score; predicted bullet impact rays; danger map (cell → time-bucketed risk); enemies aiming at the player/base | `ai.perception.ts` |
| `ai.path.ts` | Lane-grid A* (open 1, brick 3, stone/water/flag ∞, danger penalty), brick-drill plan, path invalidation on map signature change. One implementation parameterised by tier: T1 treats bricks as ∞ and danger as 0 (equivalent to BFS); T2 adds danger cost and brick edges; T3 the same with escape-brick handling | `ai.threat.ts` |
| `ai.brain.ts` | Utility scoring of six goals, role weights, coordination bonus, hysteresis, target de-confliction, yield etiquette, memory update | `ai.profiles.ts`, `ai.threat.ts`, `ai.path.ts` |
| `ai.tactics.ts` | Per-frame: predictive dodge, aim lead, fire gating, brick shots, lane yielding, anti-stuck | `ai.perception.ts`, `ai.threat.ts` |
| `ai.logic.ts` | Thin orchestrator; keeps `aiFrameLogic(game)` called from `logics/index.ts`; writes `game.p2Controls` | all of the above |

Data flow: `aiFrameLogic` → build snapshot → compute threat/danger → every
`decisionInterval` frames re-score goals in `brain` → `tactics` executes the current
goal each frame (dodge overrides movement; fire is independent).

`ai.logic.ts` keeps `findLanePath`, `selectAiTarget` and `AI_PROFILES` exports until
the migrated tests stop needing them, then removes the dead ones.

## Goal set and utility

Six goals, each with a target position and optional enemy/brick:

| Goal | Meaning | Target selection |
|---|---|---|
| `defend` | Protect the base | Highest-threat enemy approaching base; anchor point on its approach lane |
| `engage` | Kill the best enemy | Highest utility enemy (threat + proximity + killability + carrier) |
| `collect` | Take a worthwhile bonus | Highest-valued safe bonus |
| `support` | Complement the player | Coverage position: lane/front opposite the player's intent; flank fire |
| `retreat` | Disengage and regroup | Cover/chokepoint cell away from threats; base side |
| `patrol` | Idle stance | Role anchor: base / player / mid-map |

Scoring (all terms in `[0,1]` unless noted):

```
score(goal) = roleWeight[kind] * tierGate(kind) * features(goal)
            + coordinationBonus(goal)
            - riskPenalty(goal)
```

- `roleWeight`: see the role matrix below.
- `tierGate`: `0` or `1` per tier; locked goals (e.g. `support` below T2) score 0.
- `coordinationBonus`: from player-intent inference.
- `features(goal)`: per-goal normalized terms (distance, safety, value), defined in
  `ai.brain.ts` next to each scorer.
- Commitment: the brain keeps the current goal until `best > current * 1.15` or the
  current goal becomes invalid (target dead, path sealed, bonus expired).

Threat score:

```
threat = 0.4 * (1 - clamp(distToBase / 200, 0, 1))
       + 0.2 * typeWeight          // SPEEDY 1.0, HEAVY 0.6, NORMAL 0.5
       + 0.2 * hasLineToBase        // clear line from enemy to the flag
       + 0.1 * isBonusCarrier
       + 0.1 * isAimingAtPlayer
```

`hasLineToBase` is a sampled ray from the enemy to the flag, blocked by any
impassable object (`isImpassibleGameObject`). The map signature used for path
invalidation is a rolling hash of every object's id and position plus the flag state.

## Tier matrix (capability unlocks + scaling)

| Feature | 0 beginner | 1 intermediate | 2 pro | 3 elite |
|---|---|---|---|---|
| Pathing | greedy steer | lane BFS | A* + danger cost | A* + brick drilling |
| Aim tolerance | ±3px | ±5px | ±7px | ±8px |
| Aim lead | none | none | bullet-speed lead | bullet-speed lead |
| Aim jitter | ±6px | ±4px | ±2px | ±1px |
| Fire cooldown | 45f | 30f | 18f | 12f |
| Decision interval | 12f | 8f | 6f | 4f |
| Dodge | none | reactive (v1) | predicted ray (30f horizon) | predicted ray (45f) + escape brick / block-when-boxed |
| Base defense | small radius, nearest | radius + nearest | threat-ranked + interception | full-map interception |
| Bonus logic | none | safe only | type/state valuation | + yield etiquette + timed HELMET/TIMER/GRENADE |
| Coordination | follow p1 | follow p1 | cover opposite lane | intent inference + chokepoint cover + regroup |
| Brick drilling | no | no | yes | yes |
| Retreat threshold | early | early | medium | late |

`baseDangerRadius` keeps the v1 values (56/72/96/110); tier 0–1 keep a chase leash
(72/80px), tier 2–3 have none. The T0/T1 "follow p1" rows are implemented as the
`patrol` goal anchored to the player (the `support` goal is gated to T2+).

## Role matrix (weight presets)

| Goal | guardian | wingman (default) | hunter |
|---|---|---|---|
| defend | 2.0 | 1.2 | 0.8 |
| engage | 0.6 | 1.0 | 1.6 |
| collect | 0.7 | 1.0 | 1.3 |
| support | 0.8 | 1.5 | 0.7 |
| patrol anchor | base | player | mid-map |
| retreat threshold | one tier step earlier | tier value | one tier step later |

Roles are pure weight presets on the same brain; no separate code paths. The
retreat threshold composes tier and role: guardian retreats one tier step earlier
(more cautious) than its tier, hunter one later (braver) — e.g. a guardian at T2
uses the T1 threshold, a hunter at T2 uses the T3 threshold.

## Coordination (complement the player)

Player intent is inferred from a ~60-frame window: net displacement relative to the
base, recent kills, lives, and death state.

| Player intent | Ally behavior |
|---|---|
| PUSHING | Holds base/mid; covers the lane the player left; engages only local threats |
| HOLDING | Hunts/intercepts on the opposite lane |
| RETREATING or 1 life | Interposes against the nearest pursuer, escorts the retreat |
| DEAD or 0 lives | Anchors the base (`defend`/`patrol`) |

Target de-confliction: when two enemies have similar scores, prefer the one the
player is not already engaging (closest-to-player heuristic).

## Etiquette (polite team player)

- Yield a contested bonus when the player is closer and safe.
- Never fire through the player (existing `isFriendInLine`).
- Never shoot bricks unless the path plan or an escape requires it.
- Yield adjacent lanes when the player is moving; do not step into the player's next cell.
- Do not pre-empt the player's line of fire with a brick shot.

## Tactics (per frame)

1. **Dodge (tier ≥ 1):** project each enemy bullet along its ray; if impact occurs
   within the tier horizon, choose a safe step (not on any predicted ray), preferring
   the goal direction and cover. If no safe step: tier 3 fires at an aligned incoming
   bullet within ~40px to cancel it; tier ≥ 2 shoots an escape brick; otherwise the
   least-bad step.
2. **Fire:** fire when a target is on the aim axis within range, the line is clear of
   impassable objects and the player, `availableBullets > 0`, and the fire cooldown
   has elapsed. Aim error is `aimTolerance + jitter`; tier ≥ 2 leads the target by
   `enemySpeed * (distance / bulletSpeed)` along the enemy's heading.
3. **Brick shot (tier ≥ 2):** when the path plan's next edge is a destructible brick,
   face it and fire; replan when the map signature changes.
4. **Movement:** follow the path (tier ≥ 1) or greedy steering (tier 0); waypoints are
   lane cells; lane yielding per etiquette.
5. **Anti-stuck:** commanded movement with no displacement for 6 frames → sidestep
   perpendicular, invalidate the path; a second failure → force a goal re-score.

## Verification

| Layer | Content |
|---|---|
| Unit — threat | impact prediction hits a tank within N frames; carrier/SPEEDY rank higher; aiming-at-player detection; danger decays over time |
| Unit — path | cost ordering (open < brick), brick-drill plan, sealed target → null, danger detour, invalidation on signature change |
| Unit — brain | goal priority cases, no oscillation across ticks, role weights (guardian ≫ hunter on defend), yields contested bonus, de-confliction |
| Unit — tactics | dodge picks a safe cell, block-when-boxed fires, aim lead matches speed model, never fires through player/wall, unsticks |
| Scenarios | base rush, 2v1, bonus etiquette, maze escape via brick drilling, dead-end dodge, player pushing → ally covers base, player dead → guard |
| Benchmarks | seeded multi-seed soak (≥3 seeds × 3000 frames) measuring survival, kills, base losses, friendly-fire incidents, stuck frames; assert `T3 ≥ T2 ≥ T1 ≥ T0` on a composite with tolerance and strict `T3 > T0`, `T2 > T1`; guardian near-base time > hunter |
| Commands | `npm test`, `npm run build`, `npm run lint` |
| Manual | tier/role feel, etiquette, no 2P regressions, paused/dead control clearing |

Composite score: `survivalFrames + 50 * kills - 500 * baseLosses` (tunable, fixed
seeds to keep ordering stable).

## Files

| Action | Path |
|---|---|
| New | `src/engine/logics/ai/{ai.types,ai.profiles,ai.perception,ai.threat,ai.path,ai.brain,ai.tactics}.ts` |
| New tests | `ai.threat.test.ts`, `ai.path.test.ts`, `ai.brain.test.ts`, `ai.tactics.test.ts`, `ai.scenarios.test.ts`, `ai.bench.test.ts` |
| Rewrite | `src/engine/logics/ai.logic.ts` (orchestrator; migrate `ai.logic.test.ts`) |
| Modify | `src/engine/types/game.types.ts` (+`TypeAiRole`), `src/engine/instances/game.instance.ts` (optional `aiRole`), `src/hooks/useMenu.ts` (AI ROLE row, 8 rows), `src/components/game-provider.tsx`, `src/components/sidebar.tsx` (`AI <ROLE> <TIER>`), `src/components/menu/menu.test.tsx` (8 rows) |
| Docs | this spec; `docs/2026-09-24-ai-ally-v2-implementation.md` |

## Performance

A* runs over the 50×50 lane grid (≤2500 nodes) every 4–12 frames; danger rays are
≤10 bullets × ≤210 steps; per-frame tactics are O(enemies + bullets). No new
dependencies, no workers. The bench suite reports wall time per run via
`npm run bench`; it does not record average frame cost.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Utility weights need tuning | Seeded sweep harness (round 3 pattern) in the bench suite |
| Tier-ordering assertions flake | Fixed seeds, tolerance, assert only strong separations |
| Flat scores cause oscillation | Hysteresis + commitment window; unit-tested |
| A* cost misleads pathing (drilling too eagerly) | Brick edge cost 3 vs open 1; drill only when strictly cheaper |
| Scope creep into enemy AI | Explicitly out of scope |
| Menu cursor regression (8th row) | Existing menu test updated to cover 8 rows |

## Out of scope

- Enemy tank AI (phases, flanking, base rushes).
- Online server engine copy.
- Audio/visual communication from the ally.
- New power-ups or balance changes to lives/armor.
