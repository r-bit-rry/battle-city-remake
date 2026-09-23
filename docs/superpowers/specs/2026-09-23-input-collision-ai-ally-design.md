# Input, Collision & AI Ally Design

Date: 2026-09-23
Status: approved in session; implementation in progress

## Problem

1. Movement requires re-pressing keys. Root cause: one direction scalar per player
   cleared by any direction `keyup`, input captured via `keypress` (no arrows, relies
   on OS auto-repeat), and each direction flip burns a turn-only frame.
2. Tanks get blocked 1-4px away from walls. Root cause: free-form integer movement with
   no grid alignment; a 15x15 hitbox vs 8x8 blocks makes off-lane corners catch, and
   blocking bricks can be immune to shots when the tank is off-lane.
3. No 1-player-plus-AI mode.

## Decisions

| Topic | Decision |
|---|---|
| AI mode entry | Main menu `1 PLAYER + AI` (plain label), starts immediately |
| AI level picker | `AI LEVEL` item in SETTINGS, cycles `0..3` (beginner/intermediate/pro/elite) |
| AI star level | Same as human (`settings.playerLevel` already applies to p2) |
| AI behavior | Team player: defend base -> engage nearest -> follow player; never shoots through p1 |
| AI survivability | Hold fire range, retreat at point blank, dodge incoming bullets, beginner leash |
| Auto respawn | `AUTO RESPAWN` toggle (default y): level survivor revives the 0-lives player next level |
| Input scope | Desktop + arrow keys (P1) + mobile touch + online desktop |
| Collision | Snap perpendicular axis to nearest 8px lane on turn; keep 15x15 hitbox |
| Bullet band fix | Out of scope (moot once tanks stay aligned) |

## Changes

### Input (Fix 1)

- `src/hooks/useControls.ts`: per-player ordered held-direction list in refs; active
  direction = last held. `keydown` push (ignore `e.repeat`), `keyup` remove, `blur`
  clears. Arrows alias WASD for P1. Pause ignores repeats. Mobile uses the same lists
  with one 10ms interval per player; `touchcancel` handled; intervals cleared on
  cleanup (fixes leak).
- `src/hooks/useOnlineControls.ts`: same held-direction model; emits active direction
  each rAF frame.
- `src/engine/logics/players.logic.ts`: failed shoot no longer `return`s, so firing
  with no bullets available cannot freeze movement for a frame.

### Collision (Fix 2)

- `src/engine/utils/boolean.utils.ts`: `isTankBlockedAt(tank, x, y, busy)` - AABB
  overlap including touching, matching `Tank.move()` semantics; bounds 7..200.
- `src/engine/instances/tank.instance.ts`: `alignToGrid(busy)` snaps the coordinate
  perpendicular to facing to the nearest free lane where `coord % 8` is 0 or 7
  (max 3-4px), skipped if blocked.
- Called on direction change in `players.logic.ts` and `enemy.logic.ts`.
  Invariant: spawns are already aligned; driving keeps the perpendicular coordinate;
  turning re-aligns. 15px hitbox then always fits 16px lanes.

### AI ally (Fix 3)

- `TypeAiLevel = 'beginner' | 'intermediate' | 'pro' | 'elite'` in engine types.
- `Game` accepts optional `aiLevel`; `startLocalGame(players, settings, aiLevel?)`.
- New `src/engine/logics/ai.logic.ts`, called from `gameFrame` before
  `playersFrameLogic` when `game.aiLevel` is set. Writes `game.p2Controls`.
- Per-level profile: decision interval, aim tolerance, fire chance, base danger
  radius, bonus collection, shot leading, engage range, chase leash, dodge radius.
- Survivability: hold position and fire when aligned inside engage range, retreat
  when closer than 40% of it, dodge enemy bullets per frame, beginner only chases
  enemies within its leash (otherwise follows the player).
- `GameSettings.survivorRespawn` (default `y`): at level reset, if exactly one
  player is out of lives, revive them with 1 life. Applies to 2P and AI alike.
- 0-lives players are fully inert: no movement, shooting, or bonus pickup; they no
  longer respawn mid-level (`players.logic.ts`, `boolean.utils.ts`).
- Target priority: enemy within base danger radius -> nearest enemy within leash ->
  nearest bonus (intermediate/pro) -> player if farther than follow distance -> hold.
- Fire only when facing the target axis, aligned within tolerance, and p1 is not in
  the line of fire.
- Steering uses `isTankBlockedAt` probes with an anti-stuck fallback to any free
  direction.
- Controls cleared while paused or during p2 spawn/death.
- `useMenu.ts`: main item `1 PLAYER + AI`; `AI LEVEL (0..3)` and `AUTO RESPAWN` live in
  SETTINGS; cursor mapping extended to 7 rows; `sidebar.tsx` shows `AI`.

## Verification

- `npm run build`, `npm run lint`.
- Manual: hold W, tap/release D (movement falls back to W, no stutter); arrows work;
  alt-tab clears held keys; corridors enterable from any offset; no phantom corner
  blocks; shots destroy the brick in front.
- AI: `AI LEVEL` cycles in SETTINGS; ally follows, defends, shoots enemies, never
  hits p1; difficulty differences observable; beginner survives noticeably longer
  than the pre-fix version.
- Survivor respawn: 2P level where one player has 0 lives and the other survives ->
  the dead player returns next level with 1 life when the toggle is on, stays out
  when off.
- No automated test framework exists in the repo; manual checklist is the gate.
