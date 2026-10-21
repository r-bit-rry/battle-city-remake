import { BusyCoordinates, TypeDirection, TypeTank } from '../../types'
import { isTankBlockedAt } from '../../utils'
import {
	AiDecision,
	AiGoal,
	AiMemory,
	AiRoleProfile,
	AiSnapshot,
	AiTierFeatures,
	DangerMap,
	LanePath,
} from './ai.types'
import { advance, findIncomingBullet } from './ai.threat'

export const ALL_DIRECTIONS: TypeDirection[] = [
	'TOP',
	'BOTTOM',
	'LEFT',
	'RIGHT',
]

const WAYPOINT_REACHED_DISTANCE = 8
const HIT_BAND = 8

const distance = (x1: number, y1: number, x2: number, y2: number) =>
	Math.hypot(x1 - x2, y1 - y2)

export const stepPosition = (
	x: number,
	y: number,
	direction: TypeDirection,
	amount = 1
) => {
	switch (direction) {
		case 'TOP':
			return { x, y: y + amount }
		case 'BOTTOM':
			return { x, y: y - amount }
		case 'LEFT':
			return { x: x - amount, y }
		case 'RIGHT':
			return { x: x + amount, y }
	}
}

export const canStep = (
	ai: { id: string; x: number; y: number },
	direction: TypeDirection,
	busy: BusyCoordinates[]
) => {
	const next = stepPosition(ai.x, ai.y, direction, 1)

	return !isTankBlockedAt({ id: ai.id }, next.x, next.y, busy)
}

export const directionToWaypoint = (
	ai: { x: number; y: number },
	waypoint: { x: number; y: number }
): TypeDirection | null => {
	if (waypoint.x !== ai.x) return waypoint.x > ai.x ? 'RIGHT' : 'LEFT'
	if (waypoint.y !== ai.y) return waypoint.y > ai.y ? 'TOP' : 'BOTTOM'

	return null
}

const isDirectionSafe = (
	snapshot: AiSnapshot,
	direction: TypeDirection,
	horizon: number
) => {
	let x = snapshot.ai.x
	let y = snapshot.ai.y
	for (let t = 1; t <= horizon; t++) {
		const next = stepPosition(x, y, direction, 1)
		x = next.x
		y = next.y
		for (const bullet of snapshot.bullets) {
			if (!bullet.enemy) continue
			const position = advance(
				bullet.x,
				bullet.y,
				bullet.direction,
				bullet.speed * t
			)
			if (Math.abs(position.x - x) <= 7 && Math.abs(position.y - y) <= 7)
				return false
		}
	}

	return true
}

const friendInLine = (
	ai: { x: number; y: number },
	direction: TypeDirection,
	player: AiSnapshot['player']
) => {
	if (player.dead) return false

	const dx = player.x - ai.x
	const dy = player.y - ai.y
	if (direction === 'TOP') return Math.abs(dx) <= 7 && dy > 0
	if (direction === 'BOTTOM') return Math.abs(dx) <= 7 && dy < 0
	if (direction === 'RIGHT') return Math.abs(dy) <= 7 && dx > 0

	return Math.abs(dy) <= 7 && dx < 0
}

const shotPathClear = (
	ai: { x: number; y: number },
	direction: TypeDirection,
	target: { x: number; y: number },
	snapshot: AiSnapshot
) => {
	const distanceToTarget =
		direction === 'TOP' || direction === 'BOTTOM'
			? Math.abs(target.y - ai.y)
			: Math.abs(target.x - ai.x)
	const maxDistance = Math.min(distanceToTarget, 140)

	for (let step = 9; step <= maxDistance; step += 4) {
		const point = stepPosition(ai.x, ai.y, direction, step)
		for (const object of snapshot.obstacles) {
			if (!object.blocksBullets) continue
			if (
				point.x >= object.x - 2 &&
				point.x <= object.x + 9 &&
				point.y >= object.y - 2 &&
				point.y <= object.y + 9
			)
				return false
		}
	}

	return true
}

const firingDirection = (
	ai: { x: number; y: number },
	target: { x: number; y: number },
	tolerance: number
): TypeDirection | null => {
	const dx = target.x - ai.x
	const dy = target.y - ai.y
	if (Math.abs(dx) <= tolerance && Math.abs(dy) > tolerance)
		return dy > 0 ? 'TOP' : 'BOTTOM'
	if (Math.abs(dy) <= tolerance && Math.abs(dx) > tolerance)
		return dx > 0 ? 'RIGHT' : 'LEFT'

	return null
}

const bulletSpeedFor = (type: TypeTank) =>
	type === 'LVL_0' ? 1 : type === 'LVL_1' ? 2 : 3

const leadTarget = (
	ai: AiSnapshot['ai'],
	enemy: AiSnapshot['enemies'][number],
	features: AiTierFeatures
) => {
	if (!features.aimLead) return { x: enemy.x, y: enemy.y }

	const travel =
		distance(ai.x, ai.y, enemy.x, enemy.y) / bulletSpeedFor(ai.type)
	const lead = Math.min(enemy.speed * travel, 16)

	return advance(enemy.x, enemy.y, enemy.direction, lead)
}

const meleeAim = (
	ai: AiSnapshot['ai'],
	enemy: AiSnapshot['enemies'][number]
): TypeDirection => {
	const dx = enemy.x - ai.x
	const dy = enemy.y - ai.y
	if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT'
	if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? 'TOP' : 'BOTTOM'

	return ai.direction
}

const resolveAim = (
	ai: AiSnapshot['ai'],
	enemy: AiSnapshot['enemies'][number],
	features: AiTierFeatures,
	tolerance: number
) => {
	let rawAim = firingDirection(ai, enemy, tolerance)
	if (
		!rawAim &&
		Math.abs(enemy.x - ai.x) <= tolerance &&
		Math.abs(enemy.y - ai.y) <= tolerance
	)
		rawAim = meleeAim(ai, enemy)
	if (!features.aimLead) return { aim: rawAim, target: enemy }

	const leadPoint = leadTarget(ai, enemy, features)
	const leadAim = firingDirection(ai, leadPoint, tolerance)
	if (rawAim && leadAim === rawAim) return { aim: rawAim, target: leadPoint }
	if (!rawAim && leadAim) return { aim: leadAim, target: leadPoint }

	return { aim: rawAim, target: enemy }
}

const adjacentBrick = (
	snapshot: AiSnapshot,
	direction: TypeDirection
): boolean => {
	const point = stepPosition(snapshot.ai.x, snapshot.ai.y, direction, 8)

	return snapshot.obstacles.some(
		(object) =>
			object.destructible &&
			point.x >= object.x - 2 &&
			point.x <= object.x + 9 &&
			point.y >= object.y - 2 &&
			point.y <= object.y + 9
	)
}

const drillDirection = (snapshot: AiSnapshot): TypeDirection | null =>
	ALL_DIRECTIONS.find(
		(direction) =>
			adjacentBrick(snapshot, direction) &&
			!friendInLine(snapshot.ai, direction, snapshot.player)
	) ?? null

const chooseDirection = (
	ai: AiSnapshot['ai'],
	targetX: number,
	targetY: number,
	busy: BusyCoordinates[],
	player: AiSnapshot['player']
): TypeDirection | null => {
	const horizontal: TypeDirection = targetX >= ai.x ? 'RIGHT' : 'LEFT'
	const vertical: TypeDirection = targetY >= ai.y ? 'TOP' : 'BOTTOM'
	const options =
		Math.abs(targetX - ai.x) >= Math.abs(targetY - ai.y)
			? [horizontal, vertical]
			: [vertical, horizontal]

	for (const direction of options) {
		if (!canStep(ai, direction, busy)) continue
		const next = stepPosition(ai.x, ai.y, direction, 1)
		const blockingPlayer =
			!player.dead &&
			player.direction === direction &&
			Math.abs(next.x - player.x) <= 14 &&
			Math.abs(next.y - player.y) <= 14
		if (!blockingPlayer) return direction
	}

	for (const direction of [ai.direction, ...ALL_DIRECTIONS]) {
		if (canStep(ai, direction, busy)) return direction
	}

	return null
}

export const decideTactics = (
	snapshot: AiSnapshot,
	features: AiTierFeatures,
	_role: AiRoleProfile,
	goal: AiGoal | null,
	path: LanePath | null,
	_danger: DangerMap,
	memory: AiMemory,
	busy: BusyCoordinates[]
): AiDecision => {
	const ai = snapshot.ai

	if (features.dodgeHorizon > 0) {
		const incoming = findIncomingBullet(snapshot, features.dodgeHorizon)
		if (incoming) {
			const perpendicular: TypeDirection[] =
				incoming.direction === 'LEFT' || incoming.direction === 'RIGHT'
					? ['TOP', 'BOTTOM']
					: ['LEFT', 'RIGHT']
			const safe = perpendicular.filter((direction) => {
				if (!canStep(ai, direction, busy)) return false

				return isDirectionSafe(
					snapshot,
					direction,
					features.dodgeHorizon
				)
			})
			if (safe.length) {
				memory.path = null

				return { move: safe[0], fire: false }
			}

			if (
				features.blockBullets &&
				ai.availableBullets > 0 &&
				distance(ai.x, ai.y, incoming.x, incoming.y) <= 40
			) {
				const aim = firingDirection(ai, incoming, 7)
				if (
					aim &&
					ai.direction === aim &&
					!friendInLine(ai, aim, snapshot.player) &&
					shotPathClear(ai, aim, incoming, snapshot) &&
					memory.fireCooldown <= 0
				) {
					memory.fireCooldown = features.fireCooldown

					return { move: null, fire: true }
				}
			}

			if (features.escapeBrick && ai.availableBullets > 0) {
				const brick = drillDirection(snapshot)
				if (brick) {
					memory.path = null
					if (ai.direction === brick && memory.fireCooldown <= 0) {
						memory.fireCooldown = features.fireCooldown

						return { move: null, fire: true }
					}

					return { move: brick, fire: false }
				}
			}

			const retreat =
				incoming.direction === 'RIGHT'
					? 'LEFT'
					: incoming.direction === 'LEFT'
						? 'RIGHT'
						: incoming.direction === 'TOP'
							? 'BOTTOM'
							: 'TOP'
			if (canStep(ai, retreat, busy)) {
				memory.path = null

				return { move: retreat, fire: false }
			}
		}
	}

	const tolerance =
		Math.max(HIT_BAND, features.aimTolerance) +
		Math.random() * features.aimJitter
	const candidates = snapshot.enemies
		.filter(
			(enemy) =>
				distance(ai.x, ai.y, enemy.x, enemy.y) <= features.engageRange
		)
		.sort((a, b) => {
			const aGoal = a.id === goal?.enemyId ? 0 : 1
			const bGoal = b.id === goal?.enemyId ? 0 : 1
			if (aGoal !== bGoal) return aGoal - bGoal

			return (
				distance(ai.x, ai.y, a.x, a.y) - distance(ai.x, ai.y, b.x, b.y)
			)
		})

	for (const enemy of candidates) {
		const { aim, target } = resolveAim(ai, enemy, features, tolerance)
		if (!aim) continue
		if (ai.direction !== aim) {
			if (
				enemy.id === goal?.enemyId &&
				memory.fireCooldown <= 0 &&
				ai.availableBullets > 0
			)
				return { move: aim, fire: false }

			continue
		}
		if (
			friendInLine(ai, aim, snapshot.player) ||
			!shotPathClear(ai, aim, target, snapshot)
		)
			continue
		if (memory.fireCooldown <= 0 && ai.availableBullets > 0) {
			memory.fireCooldown = features.fireCooldown

			return { move: null, fire: true }
		}

		break
	}

	const nearest = candidates[0]
	if (nearest && (features.pathfinding === 'greedy' || !path)) {
		const dx = nearest.x - ai.x
		const dy = nearest.y - ai.y
		if (Math.abs(dx) > HIT_BAND && Math.abs(dy) > HIT_BAND) {
			const movingVertically =
				nearest.direction === 'TOP' || nearest.direction === 'BOTTOM'
			const primary: TypeDirection = movingVertically
				? dx > 0
					? 'RIGHT'
					: 'LEFT'
				: dy > 0
					? 'TOP'
					: 'BOTTOM'
			const secondary: TypeDirection = movingVertically
				? dy > 0
					? 'TOP'
					: 'BOTTOM'
				: dx > 0
					? 'RIGHT'
					: 'LEFT'
			const step = [primary, secondary].find((direction) =>
				canStep(ai, direction, busy)
			)
			if (step) return { move: step, fire: false }
		}
	}

	if (path?.brick && features.brickDrilling && ai.availableBullets > 0) {
		const direction = directionToWaypoint(ai, path.brick)
		if (
			direction &&
			distance(ai.x, ai.y, path.brick.x, path.brick.y) <= 20 &&
			adjacentBrick(snapshot, direction) &&
			!friendInLine(ai, direction, snapshot.player) &&
			memory.fireCooldown <= 0
		) {
			memory.fireCooldown = features.fireCooldown
			memory.path = null

			return ai.direction === direction
				? { move: null, fire: true }
				: { move: direction, fire: false }
		}
	}

	if (!goal) return { move: null, fire: false }
	if (
		!goal.enemyId &&
		distance(ai.x, ai.y, goal.x, goal.y) <= WAYPOINT_REACHED_DISTANCE
	)
		return { move: null, fire: false }

	let direction: TypeDirection | null = null
	if (features.pathfinding !== 'greedy' && path) {
		while (path.waypoints.length) {
			const waypoint = path.waypoints[0]
			if (waypoint.x === ai.x && waypoint.y === ai.y) {
				path.waypoints.shift()
				continue
			}
			const step = directionToWaypoint(ai, waypoint)
			if (!step) {
				path.waypoints.shift()
				continue
			}
			if (!canStep(ai, step, busy)) {
				memory.path = null
				break
			}
			direction = step
			break
		}
	}

	if (!direction)
		direction = chooseDirection(ai, goal.x, goal.y, busy, snapshot.player)

	return { move: direction, fire: false }
}
