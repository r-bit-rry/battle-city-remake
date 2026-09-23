import { Bullet, Game, Player, Tank } from '../instances'
import {
	BusyCoordinates,
	TypeAiLevel,
	TypeDirection,
	TypeGameBLock,
} from '../types'
import {
	isEnemy,
	isImpassibleGameObject,
	isPlayerCanMove,
	isPlayerDead,
	isTankBlockedAt,
} from '../utils'

export interface AiProfile {
	decisionInterval: number
	aimTolerance: number
	fireChance: number
	baseDangerRadius: number
	collectBonuses: boolean
	leadShots: boolean
	engageRange: number
	leashRange: number
	dodgeRadius: number
}

export const AI_PROFILES: Record<TypeAiLevel, AiProfile> = {
	beginner: {
		decisionInterval: 12,
		aimTolerance: 3,
		fireChance: 0.06,
		baseDangerRadius: 56,
		collectBonuses: false,
		leadShots: false,
		engageRange: 60,
		leashRange: 72,
		dodgeRadius: 36,
	},
	intermediate: {
		decisionInterval: 8,
		aimTolerance: 5,
		fireChance: 0.12,
		baseDangerRadius: 72,
		collectBonuses: true,
		leadShots: false,
		engageRange: 64,
		leashRange: 80,
		dodgeRadius: 32,
	},
	pro: {
		decisionInterval: 6,
		aimTolerance: 7,
		fireChance: 0.3,
		baseDangerRadius: 96,
		collectBonuses: true,
		leadShots: true,
		engageRange: 72,
		leashRange: Infinity,
		dodgeRadius: 36,
	},
	elite: {
		decisionInterval: 4,
		aimTolerance: 8,
		fireChance: 0.4,
		baseDangerRadius: 110,
		collectBonuses: true,
		leadShots: true,
		engageRange: 84,
		leashRange: Infinity,
		dodgeRadius: 40,
	},
}

export type AiTargetKind = 'defend' | 'engage' | 'collect' | 'escort' | 'guard'

export interface AiTarget {
	x: number
	y: number
	kind: AiTargetKind
	enemy?: Tank
}

interface AiState {
	cooldown: number
	target: AiTarget | null
	path: { x: number; y: number }[] | null
	lastX: number
	lastY: number
	lastMove: TypeDirection | null
	stuckFrames: number
}

const states = new WeakMap<Game, AiState>()

const FLAG_X = 103
const FLAG_Y = 7
const GUARD_X = 103
const GUARD_Y = 31
const FOLLOW_DISTANCE = 28
const BONUS_SAFETY_RADIUS = 40
const WAYPOINT_REACHED_DISTANCE = 8
const STUCK_FRAME_LIMIT = 8
const ALL_DIRECTIONS: TypeDirection[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT']

const LANES: number[] = []
for (let value = 7; value <= 200; value++) {
	if (value % 8 === 0 || value % 8 === 7) LANES.push(value)
}
const LANE_COUNT = LANES.length

const distance = (x1: number, y1: number, x2: number, y2: number) =>
	Math.hypot(x1 - x2, y1 - y2)

const nearestLaneIndex = (value: number) => {
	let best = 0
	for (let i = 1; i < LANE_COUNT; i++) {
		if (Math.abs(LANES[i] - value) < Math.abs(LANES[best] - value)) best = i
	}

	return best
}

const canStep = (
	ai: Player,
	direction: TypeDirection,
	busy: BusyCoordinates[]
) => {
	const x =
		direction === 'LEFT'
			? ai.coordinateX - 1
			: direction === 'RIGHT'
				? ai.coordinateX + 1
				: ai.coordinateX
	const y =
		direction === 'TOP'
			? ai.coordinateY + 1
			: direction === 'BOTTOM'
				? ai.coordinateY - 1
				: ai.coordinateY

	return !isTankBlockedAt(ai, x, y, busy)
}

// BFS over the lane grid (positions where the 15px tank fits a 16px gap).
// Returns the lane waypoints from just after the start up to the goal, or null.
export const findLanePath = (
	tank: Tank,
	targetX: number,
	targetY: number,
	busyCoordinates: BusyCoordinates[],
	ignoreId?: string
): { x: number; y: number }[] | null => {
	const blockers = ignoreId
		? busyCoordinates.filter((busy) => busy.id !== ignoreId)
		: busyCoordinates

	const startIndex =
		nearestLaneIndex(tank.coordinateY) * LANE_COUNT +
		nearestLaneIndex(tank.coordinateX)
	const goalIndex =
		nearestLaneIndex(targetY) * LANE_COUNT + nearestLaneIndex(targetX)

	const parents = new Int32Array(LANE_COUNT * LANE_COUNT).fill(-1)
	parents[startIndex] = startIndex

	const queue: number[] = [startIndex]
	let head = 0

	while (head < queue.length) {
		const current = queue[head++]
		if (current === goalIndex) break

		const xi = current % LANE_COUNT
		const yi = (current - xi) / LANE_COUNT

		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		]) {
			const nx = xi + dx
			const ny = yi + dy
			if (nx < 0 || nx >= LANE_COUNT || ny < 0 || ny >= LANE_COUNT)
				continue

			const next = ny * LANE_COUNT + nx
			if (parents[next] !== -1) continue
			if (isTankBlockedAt(tank, LANES[nx], LANES[ny], blockers)) continue

			parents[next] = current
			queue.push(next)
		}
	}

	if (parents[goalIndex] === -1) return null

	const path: { x: number; y: number }[] = []
	let node = goalIndex
	while (node !== startIndex) {
		const xi = node % LANE_COUNT
		const yi = (node - xi) / LANE_COUNT
		path.push({ x: LANES[xi], y: LANES[yi] })
		node = parents[node]
	}
	path.reverse()

	return path
}

const nearestBy = <T>(items: T[], score: (item: T) => number): T | null => {
	if (!items.length) return null

	return items.reduce((a, b) => (score(a) <= score(b) ? a : b))
}

export const selectAiTarget = (
	game: Game,
	ai: Player,
	profile: AiProfile
): AiTarget | null => {
	const { enemies, bonuses, p1 } = game
	const activeEnemies = enemies.filter((enemy) => !enemy.spawnAnimation)

	const threats = activeEnemies.filter(
		(enemy) =>
			distance(enemy.coordinateX, enemy.coordinateY, FLAG_X, FLAG_Y) <=
			profile.baseDangerRadius
	)

	const threat = nearestBy(threats, (enemy) =>
		distance(enemy.coordinateX, enemy.coordinateY, FLAG_X, FLAG_Y)
	)
	if (threat)
		return {
			x: threat.coordinateX,
			y: threat.coordinateY,
			kind: 'defend',
			enemy: threat,
		}

	const nearestEnemy = nearestBy(activeEnemies, (enemy) =>
		distance(
			enemy.coordinateX,
			enemy.coordinateY,
			ai.coordinateX,
			ai.coordinateY
		)
	)
	if (
		nearestEnemy &&
		distance(
			nearestEnemy.coordinateX,
			nearestEnemy.coordinateY,
			ai.coordinateX,
			ai.coordinateY
		) <= profile.leashRange
	)
		return {
			x: nearestEnemy.coordinateX,
			y: nearestEnemy.coordinateY,
			kind: 'engage',
			enemy: nearestEnemy,
		}

	if (profile.collectBonuses && bonuses.length) {
		const safeBonuses = bonuses.filter(
			(bonus) =>
				!activeEnemies.some(
					(enemy) =>
						distance(
							enemy.coordinateX,
							enemy.coordinateY,
							bonus.coordinateX,
							bonus.coordinateY
						) <= BONUS_SAFETY_RADIUS
				)
		)
		const bonus = nearestBy(safeBonuses, (candidate) =>
			distance(
				candidate.coordinateX,
				candidate.coordinateY,
				ai.coordinateX,
				ai.coordinateY
			)
		)
		if (bonus)
			return {
				x: bonus.coordinateX,
				y: bonus.coordinateY,
				kind: 'collect',
			}
	}

	if (!isPlayerDead(p1)) {
		if (
			distance(
				p1.coordinateX,
				p1.coordinateY,
				ai.coordinateX,
				ai.coordinateY
			) > FOLLOW_DISTANCE
		)
			return { x: p1.coordinateX, y: p1.coordinateY, kind: 'escort' }

		return null
	}

	return { x: GUARD_X, y: GUARD_Y, kind: 'guard' }
}

const chooseDirection = (
	ai: Player,
	targetX: number,
	targetY: number,
	busy: BusyCoordinates[]
): TypeDirection | null => {
	const horizontal: TypeDirection =
		targetX >= ai.coordinateX ? 'RIGHT' : 'LEFT'
	const vertical: TypeDirection = targetY >= ai.coordinateY ? 'TOP' : 'BOTTOM'
	const options =
		Math.abs(targetX - ai.coordinateX) >= Math.abs(targetY - ai.coordinateY)
			? [horizontal, vertical]
			: [vertical, horizontal]

	for (const direction of options) {
		if (canStep(ai, direction, busy)) return direction
	}

	for (const direction of [ai.direction, ...ALL_DIRECTIONS]) {
		if (canStep(ai, direction, busy)) return direction
	}

	return null
}

const retreatDirection = (
	ai: Player,
	targetX: number,
	targetY: number,
	busy: BusyCoordinates[]
): TypeDirection | null => {
	const dx = ai.coordinateX - targetX
	const dy = ai.coordinateY - targetY
	const horizontal: TypeDirection = dx >= 0 ? 'RIGHT' : 'LEFT'
	const vertical: TypeDirection = dy >= 0 ? 'TOP' : 'BOTTOM'
	const options =
		Math.abs(dx) >= Math.abs(dy)
			? [horizontal, vertical]
			: [vertical, horizontal]

	for (const direction of options) {
		if (canStep(ai, direction, busy)) return direction
	}

	return null
}

const firingDirection = (
	ai: Player,
	target: AiTarget,
	tolerance: number
): TypeDirection | null => {
	const dx = target.x - ai.coordinateX
	const dy = target.y - ai.coordinateY

	if (Math.abs(dx) <= tolerance && Math.abs(dy) > tolerance)
		return dy > 0 ? 'TOP' : 'BOTTOM'
	if (Math.abs(dy) <= tolerance && Math.abs(dx) > tolerance)
		return dx > 0 ? 'RIGHT' : 'LEFT'

	return null
}

const findIncomingBullet = (ai: Player, bullets: Bullet[], radius: number) => {
	for (const bullet of bullets) {
		if (!isEnemy(bullet.shooter)) continue

		const dx = bullet.coordinateX - ai.coordinateX
		const dy = bullet.coordinateY - ai.coordinateY
		if (Math.hypot(dx, dy) > radius) continue

		const headingToward =
			(bullet.direction === 'RIGHT' && dx < 0 && Math.abs(dy) <= 9) ||
			(bullet.direction === 'LEFT' && dx > 0 && Math.abs(dy) <= 9) ||
			(bullet.direction === 'TOP' && dy < 0 && Math.abs(dx) <= 9) ||
			(bullet.direction === 'BOTTOM' && dy > 0 && Math.abs(dx) <= 9)

		if (headingToward) return bullet
	}

	return null
}

const dodgeDirection = (
	ai: Player,
	bullet: Bullet,
	busy: BusyCoordinates[]
): TypeDirection | null => {
	const horizontal =
		bullet.direction === 'LEFT' || bullet.direction === 'RIGHT'

	const perpendicular: TypeDirection[] = horizontal
		? bullet.coordinateY >= ai.coordinateY
			? ['BOTTOM', 'TOP']
			: ['TOP', 'BOTTOM']
		: bullet.coordinateX >= ai.coordinateX
			? ['LEFT', 'RIGHT']
			: ['RIGHT', 'LEFT']

	for (const direction of perpendicular) {
		if (canStep(ai, direction, busy)) return direction
	}

	const retreat: TypeDirection =
		bullet.direction === 'RIGHT'
			? 'LEFT'
			: bullet.direction === 'LEFT'
				? 'RIGHT'
				: bullet.direction === 'TOP'
					? 'BOTTOM'
					: 'TOP'

	if (canStep(ai, retreat, busy)) return retreat

	return null
}

const isFriendInLine = (
	ai: Player,
	direction: TypeDirection,
	friend: Player
) => {
	if (isPlayerDead(friend)) return false

	const dx = friend.coordinateX - ai.coordinateX
	const dy = friend.coordinateY - ai.coordinateY

	if (direction === 'TOP') return Math.abs(dx) <= 7 && dy > 0
	if (direction === 'BOTTOM') return Math.abs(dx) <= 7 && dy < 0
	if (direction === 'RIGHT') return Math.abs(dy) <= 7 && dx > 0
	return Math.abs(dy) <= 7 && dx < 0
}

const isShotPathClear = (
	ai: Player,
	direction: TypeDirection,
	target: AiTarget,
	objects: { coordinateX: number; coordinateY: number; type: TypeGameBLock }[]
) => {
	const distanceToTarget =
		direction === 'TOP' || direction === 'BOTTOM'
			? Math.abs(target.y - ai.coordinateY)
			: Math.abs(target.x - ai.coordinateX)
	const maxDistance = Math.min(distanceToTarget, 64)

	for (let step = 9; step <= maxDistance; step += 4) {
		const x =
			direction === 'LEFT'
				? ai.coordinateX - step
				: direction === 'RIGHT'
					? ai.coordinateX + step
					: ai.coordinateX
		const y =
			direction === 'TOP'
				? ai.coordinateY + step
				: direction === 'BOTTOM'
					? ai.coordinateY - step
					: ai.coordinateY

		for (const object of objects) {
			if (!isImpassibleGameObject(object.type)) continue

			if (
				x >= object.coordinateX - 2 &&
				x <= object.coordinateX + 9 &&
				y >= object.coordinateY - 2 &&
				y <= object.coordinateY + 9
			)
				return false
		}
	}

	return true
}

const leadTarget = (target: AiTarget, profile: AiProfile): AiTarget => {
	if (!profile.leadShots || !target.enemy) return target

	const lead = 2
	switch (target.enemy.direction) {
		case 'TOP':
			return { ...target, y: target.y + lead }
		case 'BOTTOM':
			return { ...target, y: target.y - lead }
		case 'LEFT':
			return { ...target, x: target.x - lead }
		case 'RIGHT':
			return { ...target, x: target.x + lead }
	}
}

const directionToWaypoint = (
	ai: Player,
	waypoint: { x: number; y: number }
): TypeDirection | null => {
	if (waypoint.x !== ai.coordinateX)
		return waypoint.x > ai.coordinateX ? 'RIGHT' : 'LEFT'
	if (waypoint.y !== ai.coordinateY)
		return waypoint.y > ai.coordinateY ? 'TOP' : 'BOTTOM'

	return null
}

const decide = (
	game: Game,
	ai: Player,
	state: AiState,
	profile: AiProfile
): { move: TypeDirection | null; fire: boolean } => {
	const { p1 } = game
	const hold = { move: null, fire: false }

	const busy: BusyCoordinates[] = [...game.enemies, ...game.objects]
	if (!isPlayerDead(p1)) busy.push(p1)

	const incoming = findIncomingBullet(ai, game.bullets, profile.dodgeRadius)
	if (incoming) {
		const dodge = dodgeDirection(ai, incoming, busy)
		if (dodge) {
			state.path = null
			return { move: dodge, fire: false }
		}
	}

	const target = state.target && leadTarget(state.target, profile)
	if (!target) return hold

	const shotDirection = firingDirection(ai, target, profile.aimTolerance)

	if (target.enemy) {
		const enemyDistance = distance(
			ai.coordinateX,
			ai.coordinateY,
			target.x,
			target.y
		)

		if (enemyDistance < profile.engageRange * 0.4) {
			state.path = null
			return {
				move: retreatDirection(ai, target.x, target.y, busy),
				fire: false,
			}
		}

		if (shotDirection && enemyDistance <= profile.engageRange) {
			if (ai.direction !== shotDirection) {
				state.path = null
				return { move: shotDirection, fire: false }
			}

			const fire =
				!isFriendInLine(ai, shotDirection, p1) &&
				isShotPathClear(ai, shotDirection, target, game.objects) &&
				Math.random() < profile.fireChance

			return { move: null, fire }
		}
	} else if (
		distance(ai.coordinateX, ai.coordinateY, target.x, target.y) <=
		WAYPOINT_REACHED_DISTANCE
	) {
		return hold
	}

	const ignoreId =
		target.enemy?.id ?? (target.kind === 'escort' ? p1.id : undefined)

	if (!state.path || state.path.length === 0)
		state.path = findLanePath(ai, target.x, target.y, busy, ignoreId)

	let direction: TypeDirection | null = null

	while (state.path && state.path.length) {
		const waypoint = state.path[0]

		if (waypoint.x === ai.coordinateX && waypoint.y === ai.coordinateY) {
			state.path.shift()
			continue
		}

		const step = directionToWaypoint(ai, waypoint)
		if (!step) {
			state.path.shift()
			continue
		}

		if (!canStep(ai, step, busy)) {
			state.path = null
			break
		}

		direction = step
		break
	}

	return {
		move: direction ?? chooseDirection(ai, target.x, target.y, busy),
		fire: false,
	}
}

export const aiFrameLogic = (game: Game) => {
	const { p2, aiLevel } = game
	if (!p2 || !aiLevel) return

	const controls = game.p2Controls
	const profile = AI_PROFILES[aiLevel]

	if (game.isPaused || !isPlayerCanMove(p2)) {
		controls.move = null
		controls.fire = false
		return
	}

	let state = states.get(game)
	if (!state) {
		state = {
			cooldown: 0,
			target: null,
			path: null,
			lastX: p2.coordinateX,
			lastY: p2.coordinateY,
			lastMove: null,
			stuckFrames: 0,
		}
		states.set(game, state)
	}

	if (state.cooldown <= 0) {
		state.target = selectAiTarget(game, p2, profile)
		state.path = null
		state.cooldown = profile.decisionInterval
	}
	state.cooldown--

	if (state.target?.enemy && !game.enemies.includes(state.target.enemy)) {
		state.target = null
		state.path = null
		state.cooldown = 0
	}

	const decision = decide(game, p2, state, profile)
	controls.move = decision.move
	controls.fire = decision.fire

	const moved =
		p2.coordinateX !== state.lastX || p2.coordinateY !== state.lastY
	if (!moved && state.lastMove !== null && p2.direction === state.lastMove) {
		state.stuckFrames++
	} else {
		state.stuckFrames = 0
	}

	if (state.stuckFrames > STUCK_FRAME_LIMIT) {
		state.stuckFrames = 0
		state.path = null
		state.cooldown = 0
	}

	state.lastX = p2.coordinateX
	state.lastY = p2.coordinateY
	state.lastMove = controls.move
}
