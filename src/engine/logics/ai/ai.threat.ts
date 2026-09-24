import { TypeDirection } from '../../types'
import { FLAG_X, FLAG_Y } from './ai.perception'
import {
	AiBulletSnapshot,
	AiEnemySnapshot,
	AiSnapshot,
	DangerMap,
	Threat,
} from './ai.types'

const LANE_VALUES: number[] = []
for (let value = 7; value <= 200; value++) {
	if (value % 8 === 0 || value % 8 === 7) LANE_VALUES.push(value)
}

const distance = (x1: number, y1: number, x2: number, y2: number) =>
	Math.hypot(x1 - x2, y1 - y2)

export const nearestLane = (value: number) =>
	LANE_VALUES.reduce(
		(best, lane) =>
			Math.abs(lane - value) < Math.abs(best - value) ? lane : best,
		LANE_VALUES[0]
	)

export const advance = (
	x: number,
	y: number,
	direction: TypeDirection,
	amount: number
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

const typeWeight = (type: AiEnemySnapshot['type']) =>
	type === 'SPEEDY' ? 1 : type === 'HEAVY' ? 0.6 : 0.5

const obstacleAt = (
	snapshot: AiSnapshot,
	x: number,
	y: number,
	ignoreFlag = false
) =>
	snapshot.obstacles.find(
		(object) =>
			object.blocksBullets &&
			!(ignoreFlag && object.flag) &&
			x >= object.x - 2 &&
			x <= object.x + 9 &&
			y >= object.y - 2 &&
			y <= object.y + 9
	)

export const hasLineToBase = (snapshot: AiSnapshot, enemy: AiEnemySnapshot) => {
	const steps = Math.ceil(distance(enemy.x, enemy.y, FLAG_X, FLAG_Y) / 4)
	for (let i = 1; i < steps; i++) {
		const t = i / steps
		const x = enemy.x + (FLAG_X - enemy.x) * t
		const y = enemy.y + (FLAG_Y - enemy.y) * t
		if (obstacleAt(snapshot, x, y, true)) return false
	}

	return true
}

const aimingPlayer = (snapshot: AiSnapshot, enemy: AiEnemySnapshot) => {
	const dx = snapshot.player.x - enemy.x
	const dy = snapshot.player.y - enemy.y
	if (Math.abs(dx) > 7 && Math.abs(dy) > 7) return false

	const facing =
		(enemy.direction === 'TOP' && dy > 0) ||
		(enemy.direction === 'BOTTOM' && dy < 0) ||
		(enemy.direction === 'LEFT' && dx < 0) ||
		(enemy.direction === 'RIGHT' && dx > 0)

	return (
		facing &&
		distance(enemy.x, enemy.y, snapshot.player.x, snapshot.player.y) <= 120
	)
}

export const computeThreats = (snapshot: AiSnapshot): Threat[] =>
	snapshot.enemies
		.map((enemy) => {
			const distToBase = distance(enemy.x, enemy.y, FLAG_X, FLAG_Y)
			const line = hasLineToBase(snapshot, enemy)
			const aiming = aimingPlayer(snapshot, enemy)
			const score =
				0.4 * (1 - Math.min(1, distToBase / 200)) +
				0.2 * typeWeight(enemy.type) +
				0.2 * (line ? 1 : 0) +
				0.1 * (enemy.carrier ? 1 : 0) +
				0.1 * (aiming ? 1 : 0)

			return {
				enemyId: enemy.id,
				score,
				hasLineToBase: line,
				aimingPlayer: aiming,
			}
		})
		.sort((a, b) => b.score - a.score)

export const predictedHit = (
	bullet: AiBulletSnapshot,
	snapshot: AiSnapshot,
	x: number,
	y: number,
	horizon: number
) => {
	if (horizon <= 0) return false
	let bx = bullet.x
	let by = bullet.y
	for (let t = 1; t <= horizon; t++) {
		const next = advance(bx, by, bullet.direction, bullet.speed)
		bx = next.x
		by = next.y
		if (obstacleAt(snapshot, bx, by)) return false
		if (Math.abs(bx - x) <= 7 && Math.abs(by - y) <= 7) return true
	}

	return false
}

export const findIncomingBullet = (
	snapshot: AiSnapshot,
	horizon: number
): AiBulletSnapshot | null => {
	if (horizon <= 0) return null
	let best: AiBulletSnapshot | null = null
	let bestFrame = Infinity
	for (const bullet of snapshot.bullets) {
		if (!bullet.enemy) continue
		let bx = bullet.x
		let by = bullet.y
		for (let t = 1; t <= horizon; t++) {
			const next = advance(bx, by, bullet.direction, bullet.speed)
			bx = next.x
			by = next.y
			if (obstacleAt(snapshot, bx, by)) break
			if (
				Math.abs(bx - snapshot.ai.x) <= 7 &&
				Math.abs(by - snapshot.ai.y) <= 7
			) {
				if (t < bestFrame) {
					bestFrame = t
					best = bullet
				}
				break
			}
		}
	}

	return best
}

export const buildDangerMap = (
	snapshot: AiSnapshot,
	horizon: number
): DangerMap => {
	const cells = new Map<string, number>()
	for (const bullet of snapshot.bullets) {
		if (!bullet.enemy) continue
		let bx = bullet.x
		let by = bullet.y
		for (let t = 1; t <= horizon; t++) {
			const next = advance(bx, by, bullet.direction, bullet.speed)
			bx = next.x
			by = next.y
			if (obstacleAt(snapshot, bx, by)) break
			const key = `${nearestLane(bx)},${nearestLane(by)}`
			const current = cells.get(key)
			if (current === undefined || current > t) cells.set(key, t)
		}
	}

	return { cells }
}

export const isCellDangerous = (
	danger: DangerMap,
	x: number,
	y: number,
	withinFrames: number
) => {
	const frame = danger.cells.get(`${nearestLane(x)},${nearestLane(y)}`)

	return frame !== undefined && frame <= withinFrames
}
