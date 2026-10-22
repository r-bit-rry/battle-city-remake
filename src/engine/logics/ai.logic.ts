import { Game } from '../instances'
import { BusyCoordinates, TypeDirection } from '../types'
import { isPlayerCanMove, isPlayerDead } from '../utils'
import { AI_ROLE_PROFILES, AI_TIER_FEATURES } from './ai/ai.profiles'
import {
	buildSnapshot,
	createMemory,
	goalStalled,
	PROGRESS_WINDOW,
	wedgedInWindow,
} from './ai/ai.perception'
import { buildDangerMap, computeThreats } from './ai/ai.threat'
import { findPath } from './ai/ai.path'
import { selectGoal } from './ai/ai.brain'
import {
	ALL_DIRECTIONS,
	canStep,
	COMMIT_TICKS,
	decideTactics,
	stepPosition,
	WAYPOINT_REACHED_DISTANCE,
} from './ai/ai.tactics'
import { AiMemory, AiSnapshot, DangerMap } from './ai/ai.types'

const states = new WeakMap<Game, AiMemory>()

const NO_PROGRESS_SIDESTEP = 4
const NO_PROGRESS_GOAL = 12
const DANGER_REFRESH_FRAMES = 3

// everything buildDangerMap reads, so an unchanged key means an identical map
const dangerKeyOf = (snapshot: AiSnapshot) => {
	let key = snapshot.mapSignature
	for (const bullet of snapshot.bullets)
		if (bullet.enemy) key += `|${bullet.x},${bullet.y},${bullet.direction}`

	return key
}

export const getAiMemory = (game: Game) => states.get(game)

export const aiFrameLogic = (game: Game) => {
	const { p1, p2, aiLevel } = game
	if (!p2 || !aiLevel) return

	const controls = game.p2Controls
	const features = AI_TIER_FEATURES[aiLevel]
	const role = AI_ROLE_PROFILES[game.aiRole ?? 'wingman']

	if (game.isPaused || !isPlayerCanMove(p2)) {
		controls.move = null
		controls.fire = false
		return
	}

	let memory = states.get(game)
	if (!memory) {
		memory = createMemory()
		states.set(game, memory)
	}

	const snapshot = buildSnapshot(game, memory)
	const busy: BusyCoordinates[] = [...game.enemies, ...game.objects]
	if (!isPlayerDead(p1)) busy.push(p1)

	if (memory.fireCooldown > 0) memory.fireCooldown--

	let danger: DangerMap = memory.danger ?? {
		cells: new Map<number, number>(),
	}
	if (features.dodgeHorizon > 0) {
		const dangerKey = dangerKeyOf(snapshot)
		if (
			!memory.danger ||
			memory.dangerKey !== dangerKey ||
			game.frame % DANGER_REFRESH_FRAMES === 0
		) {
			danger = buildDangerMap(
				snapshot,
				features.dodgeHorizon,
				memory.danger ?? undefined
			)
			memory.danger = danger
			memory.dangerKey = dangerKey
		}
	}

	if (
		(memory.goal?.enemyId &&
			!snapshot.enemies.some(
				(enemy) => enemy.id === memory.goal?.enemyId
			)) ||
		(memory.goal?.bonusId &&
			!snapshot.bonuses.some(
				(bonus) => bonus.id === memory.goal?.bonusId
			))
	) {
		memory.goal = null
		memory.path = null
		memory.pathSignature = null
		memory.cooldown = 0
		memory.commitDir = null
		memory.commitTicks = 0
	}

	if (memory.cooldown <= 0 || !memory.goal) {
		const threats = computeThreats(snapshot)
		const previous = memory.goal
		memory.goal = selectGoal(snapshot, threats, features, role, memory)
		if (
			previous?.kind !== memory.goal?.kind ||
			previous?.enemyId !== memory.goal?.enemyId
		) {
			memory.commitDir = null
			memory.commitTicks = 0
		}
		memory.cooldown = features.decisionInterval
		memory.path = null
		memory.pathSignature = null
	}
	memory.cooldown--

	// The path is rebuilt on every decision tick on purpose: reusing it changes
	// which direction decideTactics picks, and this is a perf task, not a
	// strategy one (measured: elite seed 7 fell from 2651 to 1131 ticks).
	if (memory.goal && features.pathfinding !== 'greedy') {
		const needsPath =
			!memory.path || memory.pathSignature !== snapshot.mapSignature
		if (needsPath) {
			const ignoreId =
				memory.goal.enemyId ??
				(memory.goal.kind === 'patrol' || memory.goal.kind === 'support'
					? p1.id
					: undefined)
			memory.path = findPath(
				{
					id: snapshot.ai.id,
					coordinateX: snapshot.ai.x,
					coordinateY: snapshot.ai.y,
				},
				memory.goal.x,
				memory.goal.y,
				busy,
				{
					allowBrick: features.brickDrilling,
					danger: features.dodgeHorizon > 0 ? danger : undefined,
					dangerPenalty: 0.5,
					dangerHorizon: features.dodgeHorizon,
					ignoreId,
				}
			)
			memory.pathSignature = snapshot.mapSignature
		}
	}

	const decision = decideTactics(
		snapshot,
		features,
		role,
		memory.goal,
		memory.path,
		danger,
		memory,
		busy
	)
	controls.move = decision.move
	controls.fire = decision.fire

	// Pure position comparison: a tank that alternates directions never moves,
	// so its facing is not evidence of progress.
	const moved =
		p2.coordinateX !== memory.lastX || p2.coordinateY !== memory.lastY
	memory.noProgressTicks = moved ? 0 : memory.noProgressTicks + 1

	// A limit cycle moves a pixel every tick, so adjacent frames look fine:
	// compare against the position a window ago as well.
	memory.positionTrack.push({
		x: p2.coordinateX,
		y: p2.coordinateY,
	})
	if (memory.positionTrack.length > PROGRESS_WINDOW)
		memory.positionTrack.shift()

	const goal = memory.goal

	// A closed window with no net progress is a wedge even when the tank is
	// moving, which the frame-to-frame counter above cannot see. Two windows
	// straight before acting: one window of a tight patrol is not a wedge.
	const cycle =
		memory.positionTrack.length >= PROGRESS_WINDOW &&
		wedgedInWindow(memory.positionTrack, p2.coordinateX, p2.coordinateY)

	const stalled =
		// A greedy tier has no path to discard, so this would only re-roll its
		// aim jitter; the wedge it is meant to break is a waypoint problem.
		features.pathfinding !== 'greedy' &&
		goalStalled(
			memory,
			goal,
			p2.coordinateX,
			p2.coordinateY,
			WAYPOINT_REACHED_DISTANCE,
			// defending is a held position, not a journey: only a shuttling
			// defender is stalled.
			cycle
		)

	memory.wedgedTicks = cycle ? memory.wedgedTicks + 1 : 0
	const wedged = memory.wedgedTicks >= PROGRESS_WINDOW

	if (stalled && goal) {
		memory.positionTrack = []
		memory.stallKey = null
		memory.stallGap = 0
		memory.stallTicks = 0
		memory.goal = null
		memory.cooldown = 0
		memory.path = null
		memory.pathSignature = null
		memory.commitDir = null
		memory.commitTicks = 0
		memory.wedgedTicks = 0
		// off the lane it has been circling on, losing the least ground: the
		// "opposing sidestep" below can walk back down the same lane
		const perpendicular: TypeDirection[] =
			snapshot.ai.direction === 'TOP' ||
			snapshot.ai.direction === 'BOTTOM'
				? ['LEFT', 'RIGHT']
				: ['TOP', 'BOTTOM']
		const sidestep = perpendicular
			.filter((direction) => canStep(snapshot.ai, direction, busy))
			.sort((a, b) => {
				const stepA = stepPosition(p2.coordinateX, p2.coordinateY, a)
				const stepB = stepPosition(p2.coordinateX, p2.coordinateY, b)

				return (
					Math.hypot(stepA.x - goal.x, stepA.y - goal.y) -
					Math.hypot(stepB.x - goal.x, stepB.y - goal.y)
				)
			})[0]
		if (sidestep) {
			controls.move = sidestep
			memory.commitDir = sidestep
			memory.commitTicks = COMMIT_TICKS
		}
	} else if (memory.noProgressTicks >= NO_PROGRESS_GOAL) {
		memory.noProgressTicks = 0
		memory.positionTrack = []
		memory.goal = null
		memory.cooldown = 0
		memory.path = null
		memory.pathSignature = null
		memory.commitDir = null
		memory.commitTicks = 0
		// a wedged tank needs a new heading as well as a new goal: turn it
		// around, or at least off the lane it has been circling on
		if (wedged) {
			const perpendicular: TypeDirection[] =
				snapshot.ai.direction === 'TOP' ||
				snapshot.ai.direction === 'BOTTOM'
					? ['LEFT', 'RIGHT']
					: ['TOP', 'BOTTOM']
			const sidestep = [...perpendicular, ...ALL_DIRECTIONS].find(
				(direction) => canStep(snapshot.ai, direction, busy)
			)
			if (sidestep) {
				controls.move = sidestep
				memory.commitDir = sidestep
				memory.commitTicks = COMMIT_TICKS
			}
		}
		memory.wedgedTicks = 0
	} else if (memory.noProgressTicks === NO_PROGRESS_SIDESTEP) {
		memory.path = null
		const sidestep = ALL_DIRECTIONS.find(
			(direction) =>
				direction !== memory.commitDir &&
				canStep(snapshot.ai, direction, busy)
		)
		if (sidestep) {
			controls.move = sidestep
			memory.commitDir = sidestep
			memory.commitTicks = COMMIT_TICKS
		}
	}

	memory.lastX = p2.coordinateX
	memory.lastY = p2.coordinateY
}
