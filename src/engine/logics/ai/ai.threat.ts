import { TypeDirection } from '../../types'
import {
	BLOCK_CELLS,
	BLOCK_FLAG,
	BLOCK_FREE,
	FLAG_X,
	FLAG_Y,
} from './ai.perception'
import {
	AiBulletSnapshot,
	AiEnemySnapshot,
	AiObstacleSnapshot,
	AiSnapshot,
	DangerMap,
	Threat,
} from './ai.types'
import { LANE_COUNT, nearestLaneIndex } from './ai.path'

const distance = (x1: number, y1: number, x2: number, y2: number) =>
	Math.hypot(x1 - x2, y1 - y2)

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

const stepDelta = (direction: TypeDirection, amount: number) => {
	switch (direction) {
		case 'TOP':
			return { x: 0, y: amount }
		case 'BOTTOM':
			return { x: 0, y: -amount }
		case 'LEFT':
			return { x: -amount, y: 0 }
		case 'RIGHT':
			return { x: amount, y: 0 }
	}
}

const typeWeight = (type: AiEnemySnapshot['type']) =>
	type === 'SPEEDY' ? 1 : type === 'HEAVY' ? 0.6 : 0.5

const obstacleInCell = (
	snapshot: AiSnapshot,
	cx: number,
	cy: number,
	ignoreFlag: boolean
): AiObstacleSnapshot | undefined => {
	if (cx < 0 || cx >= BLOCK_CELLS || cy < 0 || cy >= BLOCK_CELLS)
		return undefined

	const cell = cy * BLOCK_CELLS + cx
	const value = snapshot.blocked[cell]
	if (value === BLOCK_FREE || (ignoreFlag && value === BLOCK_FLAG))
		return undefined

	// two obstacles can share a cell only if their boxes overlap; the later one
	// in `obstacles` wins, which is safe because no caller reads the fields
	return snapshot.obstacles[snapshot.blockedOwner[cell] - 1]
}

export const obstacleAt = (
	snapshot: AiSnapshot,
	x: number,
	y: number,
	ignoreFlag = false
): AiObstacleSnapshot | undefined => {
	// A cell holds the obstacle *origin*, and a point is inside the bullet box
	// [ox-2, ox+9] when ox is in [x-9, x+2]. With x = 8cx+rx that window only
	// reaches origin cell cx-1 when rx <= 1 and cx+1 when rx >= 6, so these
	// four probes are exact for integer and fractional points alike.
	const cx = Math.floor(x / 8)
	const rx = x - cx * 8
	const cy = Math.floor(y / 8)
	const ry = y - cy * 8
	const x0 = rx <= 1 ? cx - 1 : cx
	const x1 = rx >= 6 ? cx + 1 : cx
	const y0 = ry <= 1 ? cy - 1 : cy
	const y1 = ry >= 6 ? cy + 1 : cy

	return (
		obstacleInCell(snapshot, x0, y0, ignoreFlag) ??
		obstacleInCell(snapshot, x1, y0, ignoreFlag) ??
		obstacleInCell(snapshot, x0, y1, ignoreFlag) ??
		obstacleInCell(snapshot, x1, y1, ignoreFlag)
	)
}

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
	const step = stepDelta(bullet.direction, bullet.speed)
	let bx = bullet.x
	let by = bullet.y
	for (let t = 1; t <= horizon; t++) {
		bx += step.x
		by += step.y
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
		const step = stepDelta(bullet.direction, bullet.speed)
		let bx = bullet.x
		let by = bullet.y
		for (let t = 1; t <= horizon; t++) {
			bx += step.x
			by += step.y
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
	horizon: number,
	cache?: DangerMap
): DangerMap => {
	const cells = cache ? cache.cells : new Map<number, number>()
	if (cache) cells.clear()
	for (const bullet of snapshot.bullets) {
		if (!bullet.enemy) continue
		const step = stepDelta(bullet.direction, bullet.speed)
		let bx = bullet.x
		let by = bullet.y
		for (let t = 1; t <= horizon; t++) {
			bx += step.x
			by += step.y
			if (obstacleAt(snapshot, bx, by)) break
			const key = nearestLaneIndex(by) * LANE_COUNT + nearestLaneIndex(bx)
			const current = cells.get(key)
			if (current === undefined || current > t) cells.set(key, t)
		}
	}

	return cache ?? { cells }
}

export const isCellDangerous = (
	danger: DangerMap,
	x: number,
	y: number,
	withinFrames: number
) => {
	const frame = danger.cells.get(
		nearestLaneIndex(y) * LANE_COUNT + nearestLaneIndex(x)
	)

	return frame !== undefined && frame <= withinFrames
}
