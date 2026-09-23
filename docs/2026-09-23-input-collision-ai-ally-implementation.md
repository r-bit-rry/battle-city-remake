# Input, Collision & AI Ally — Implementation Record

Date: 2026-09-23
Design spec: `docs/superpowers/specs/2026-09-23-input-collision-ai-ally-design.md`
Status: implemented, build + 29 automated tests green, manual QA pending

## What was built

1. **Input persistence fix** — overlapping held keys no longer cancel movement or require
   re-presses; arrow keys work; mobile touch intervals no longer leak.
2. **Grid alignment fix** — tanks stay on 8px lanes, so 1-4px corner snags and unshootable
   blocking bricks are gone.
3. **`1 PLAYER + AI` mode** — team-player AI ally with three difficulty levels.
4. **Follow-up round** — AI level moved into SETTINGS (main-menu label wrapped and broke the
   cursor alignment), `AUTO RESPAWN` toggle added, AI survivability overhauled, 0-life
   players made fully inert.
5. **Round 3** — cursor alignment made structural (cursor rendered inside the selected row),
   Vitest + jsdom test infrastructure added, lane-grid BFS pathfinding and a target-kind
   strategy for the AI, dodge direction-sign bug fixed, profiles tuned with seeded sweeps.
6. **Round 4** — cursor X restored to the original fixed offset (only Y is measured from the
   selected row), `AUTO RESPAWN` rename, AI levels shown as `0..3` with a new `elite` profile,
   menu tests now mock layout rects and assert both axes.

## Design decisions

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| 1 | Held-direction **stack** per player (last pressed wins), recomputed on keyup | Releasing the newer key must fall back to the still-held one | Single direction scalar cleared on any keyup (the original bug) |
| 2 | `keydown`/`keyup` instead of `keypress` | `keypress` never fires for arrows and gives no repeat control | Keep `keypress` and rely on OS auto-repeat |
| 3 | Snap perpendicular axis to `% 8 ∈ {0,7}` on every turn, validated with an AABB probe | 15px tank in 8px tiles needs lanes; original Battle City behavior; keeps 15px hitbox and untouched `move()` | Corner nudging, 14px hitbox, rewriting collision to overlap-based |
| 4 | AI writes `game.p2Controls` before `playersFrameLogic` | Reuses the existing command bus and p2 rendering; no new tank class or frame phase | Reuse enemy `nextMoves` (never generated/consumed for players); separate AI tank type |
| 5 | AI level lives in SETTINGS; main menu item is plain `1 PLAYER + AI` | Long label wrapped to a second line and shifted rows, breaking the hardcoded cursor positions | A/D cycling on the main item (original attempt); 3-item submenu |
| 6 | `AUTO RESPAWN` default `y` | User wanted the AI to keep playing after dying out; toggleable for classic 2P | Default off (opt-in classic behavior) |
| 7 | 0-life players are fully inert (no move/shoot/bonus, no mid-level ghost respawn) | Previously a 0-life player respawned invisibly and could still act | Leave ghost behavior as-is |
| 8 | Per-difficulty AI profiles (reaction, aim, fire, range, leash, dodge) | Beginner was suicidal at close range with slow aim | Single behavior with only fire-rate scaling |
| 9 | AI survivability: hold at engage range, retreat below 40% of it, dodge incoming bullets, beginner chase leash | Direct fix for beginner dying in under a minute | More lives/armor (changes game balance) |
| 10 | Bullet-vs-block hit band left untouched | Moot once tanks stay on lanes; smaller change surface | Widen hit band (rejected as scope) |
| 11 | Online server out of scope | Server has its own engine copy in a separate repo | Mirror changes into the server repo now |
| 12 | Cursor X stays at the **original fixed offset** (`(54-7) * pixel`); only Y is measured from the selected row's rect | The row-relative `left: 0` moved the tank over the text at breakpoints with a larger `margin-left`; X was never broken | Keep row-relative X; tune hardcoded Y values per breakpoint |
| 13 | AI movement uses BFS over the **lane grid** (positions where both coords are lanes), not tile centers | Every graph node is a legal tank position, so waypoints map 1:1 to `move` directions and turns re-snap exactly | Greedy steering only (gets stuck behind walls); tile-center BFS (needs lane conversion) |
| 14 | Difficulty constants chosen by a **seeded multi-seed sweep** (9 seeds × 3000 frames, solo vs 4 enemies) | Tuning by feel was misleading; sweeps showed e.g. beginner deaths 5/9 → 2/9 | Guess-and-check constants; single-seed measurements |

## Implementation map

### Input

- `src/hooks/useControls.ts` — held-key helpers (~24-46), `useCallback` input handler,
  `keydown`/`keyup` + `blur` clearing, arrow aliases for P1, pause ignores `e.repeat`, mobile
  uses one 10ms interval per player over the same held list with `touchcancel` and cleanup.
- `src/hooks/useOnlineControls.ts` — same model for the socket path; emits the active direction
  each rAF frame.
- `src/engine/logics/players.logic.ts:28` — a failed shot no longer `return`s, so holding fire
  with no bullet available cannot freeze movement for a frame.

### Collision

- `src/engine/utils/boolean.utils.ts:22` — `isTankBlockedAt(tank, x, y, busy)`: AABB overlap
  including touching (matches `Tank.move()` semantics), bounds 7..200.
- `src/engine/instances/tank.instance.ts:227` — `alignToGrid(busy)`: nearest free lane from
  `{base, base+7, base+8}` on the axis perpendicular to facing.
- Wired on direction change: `players.logic.ts:48`, `enemy.logic.ts:101`.
- Invariant: spawns are already on lanes (71≡7, 136≡0, y=7); driving keeps the perpendicular
  fixed; turning re-aligns. `Tank.move()` was left untouched.

### AI ally

- `src/engine/types/game.types.ts:5` — `survivorRespawn`; `TypeAiLevel` type.
- `src/engine/instances/game.instance.ts:68` — optional `aiLevel` ctor arg; `:164` revive rule.
- `src/engine/logics/ai.logic.ts` — `aiFrameLogic`, called at `logics/index.ts:19` before
  `playersFrameLogic`. Strategy kinds: `defend` (enemy inside base danger radius) → `engage`
  (nearest enemy inside leash) → `collect` (safe bonus; enemies within 40px make it unsafe) →
  `escort` (player farther than 28px) → hold near player → `guard` (player out of lives).
- `findLanePath` — BFS over the 50×50 lane grid; `ignoreId` lets the goal cell be occupied by
  the target itself. `selectAiTarget` and `findLanePath` are exported for tests.
- Path following consumes 1px waypoints; blocked waypoints fall back to greedy steering and
  recompute next decision tick. Stuck detection (8 frames without displacement while trying to
  move) invalidates the path and forces a re-decision.
- Dodge check: enemy bullets heading *toward* the AI (sign-corrected in round 3) inside the
  profile radius trigger a perpendicular sidestep, or a retreat along the bullet axis in
  corridors.
- Safety: `isFriendInLine` blocks shots through p1; `isShotPathClear` blocks shots through
  impassible objects; stale cached targets are dropped when the enemy despawns.
- `src/engine/logics/bonuses.logic.ts:17` — only players with lives can pick up bonuses.

### Lives semantics

- `boolean.utils.ts:58,63` — `isPlayerCanShoot`/`isPlayerCanMove` now require `lives > 0`.
- `players.logic.ts:24` — respawn only when `lives > 0`.
- `game.instance.ts:164` — with `survivorRespawn`, a 0-life player gets 1 life at level reset if
  the other player survived; otherwise they stay out.

### Menu / UI

- `src/hooks/useMenu.ts` — main: `1 PLAYER`, `1 PLAYER + AI`, `2 PLAYERS`, `MULTIPLAYER`,
  `SETTINGS`; `AI LEVEL (0..3)` and `AUTO RESPAWN` live in SETTINGS; level cycling; starts 2P
  with `aiLevel`.
- `src/components/menu/menu.tsx` — rows carry `data-menu-row={index}`; the cursor renders once
  in the wrapper, X at the original fixed offset, Y measured from the selected row's rect in a
  layout effect (`rowRect.top - wrapperRect.top - wrapper.clientTop + rowRect.height / 2`).
- `src/components/menu/cursor.tsx` — takes `top` and `pixel`; no hardcoded row table.
- `src/components/sidebar.tsx` — p2 label shows `AI` when `game.aiLevel` is set.
- `src/components/game-provider.tsx` — `startLocalGame(players, settings, editor?, aiLevel?)`.

## Test infrastructure

- Vitest 2 + jsdom + Testing Library (`npm test`), configured in `vite.config.ts`, setup in
  `src/test-setup.ts` (stubs `HTMLMediaElement.play`, guards node-environment files).
- `src/components/menu/menu.test.tsx` — regression test for the cursor bug: the cursor must be
  a descendant of the selected row on the 5 main rows and all 7 settings rows, including
  wrap-around. Structural assertions, since jsdom has no layout engine.
- `src/engine/logics/ai.logic.test.ts` — pathfinding (straight/detour/sealed/ignored goal),
  target priority (defend > engage, spawning enemies ignored, risky bonuses skipped), and edge
  cases (dodge, friend in line, wall in line, dead/paused, retarget, routes around a wall).
- `src/engine/engine.test.ts` — grid alignment, survivor respawn on/off, dead players inert,
  AI soak across three seeds (1200 frames each).

## AI difficulty profiles

| Level | Decide every | Aim tol | Fire/frame | Base radius | Engage range | Chase leash | Dodge radius | Bonuses | Lead |
|---|---|---|---|---|---|---|---|---|---|
| beginner (0) | 12 frames | ±3px | 6% | 56px | 60px | 72px | 36px | no | no |
| intermediate (1) | 8 frames | ±5px | 12% | 72px | 64px | 80px | 32px | yes | no |
| pro (2) | 6 frames | ±7px | 30% | 96px | 72px | ∞ | 36px | yes | yes |
| elite (3) | 4 frames | ±8px | 40% | 110px | 84px | ∞ | 40px | yes | yes |

Solo-vs-four-enemies survival (9 seeds × 3000 frames, player idle; frames survived, deaths):
beginner 2298→2671, 5/9→2/9; intermediate 2132→2845, 5/9→1/9; pro unchanged (every
single-variable change made it worse: bigger dodge radii over-dodge at range and stop firing).

## Verification

Commands: `npm test` (29 tests, 3 files, green), `npm run build` (tsc + vite, green),
`npm run lint` (0 errors; 4 pre-existing exhaustive-deps warnings in useAudio/useEditorKeys/useMenu).

Test coverage highlights:

- **Menu cursor regression** — with mocked layout rects, the cursor's X stays at the fixed
  offset and its Y equals the selected row's center on all main and settings rows, through
  navigation and wrap-around; SETTINGS shows `AI LEVEL (0)` and `AUTO RESPAWN` and cycles the
  level to `1`.
- **Pathfinding** — straight lane path, detour around a wall, sealed target returns null,
  ignored target cell is reachable.
- **Strategy** — base threat beats a nearer enemy; spawning enemies ignored; risky bonuses
  skipped; escort/guard fallbacks.
- **Edge cases** — incoming-bullet dodge (sign-corrected), no fire through friend or wall,
  dead/paused controls cleared, retarget after despawn, routes around a wall instead of
  pushing into it.
- **Engine regressions** — lane snapping, corner catch off-lane/clear on-lane, survivor
  respawn on/off, dead players inert, AI soak across seeds.

Manual QA checklist: hold W + tap/release D (falls back, no stutter); arrows; Alt-Tab clears
keys; turn into 16px gaps from any offset; shoot the brick in front; main-menu cursor on all 5
rows; SETTINGS 7 rows and toggles; AI level affects behavior; let the AI die out and finish the
level to see the revive; AI paths around walls instead of grinding against them.

## Known limitations / follow-ups

- **Online**: the server repo owns its engine copy — grid snap, survivor respawn, and AI v2 do
  not apply online until mirrored; the input fix is client-side and does apply.
- p2 keyboard bindings remain active in AI mode; the AI overwrites `p2Controls` every frame, so
  they are ignored (could be gated on `!game.aiLevel` for clarity).
- Menu cursor tests mock `getBoundingClientRect` (jsdom has no layout); geometry math is
  covered, real pixel positions rely on the layout effect.
- Tank-vs-bullet hit band mismatch still exists off-lane (unreachable while lanes hold).
- BFS recomputes only when the cached path is empty or blocked, on a 50×50 lane graph.
- Pro's aggression measures worse than beginner/intermediate in the solo soak; the metric has
  player idle and four enemies focused on the base, so it is kept for real play with a human.
- Pre-existing lint warnings are untouched by design (baseline before the change).

## Session artifact

- Skill capturing the reusable process: `~/.config/opencode/skills/frame-based-game-engines/SKILL.md`.
