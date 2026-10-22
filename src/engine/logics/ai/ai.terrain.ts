import { TypeDirection } from '../../types'
import {
	BLOCK_BRICK,
	BLOCK_CELLS,
	BLOCK_FREE,
	BLOCK_SOLID,
	FLAG_X,
	FLAG_Y,
} from './ai.perception'
import { advance, obstacleAt } from './ai.threat'
import { AiGoal, AiSnapshot, AiTierFeatures } from './ai.types'

const FLAG_WALL_RADIUS = 24
const DRILL_LANE_REACH = 152
const LANE_STEP = 8
const HIT_BAND = 7

const DIRECTIONS: TypeDirection[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT']

// The flag is a 15 px box on the engine's grid; its wall is the ring of cells
// the box touches. Cells that fall off the board are the map edge, which no
// enemy can cross, so they seal a side just like a brick does.
const FLAG_MIN_CELL_X = (FLAG_X - 7) >> 3
const FLAG_MAX_CELL_X = (FLAG_X + 7) >> 3
const FLAG_MIN_CELL_Y = (FLAG_Y - 7) >> 3
const FLAG_MAX_CELL_Y = (FLAG_Y + 7) >> 3

const nearFlag = (x: number, y: number) =>
	Math.abs(x - FLAG_X) <= FLAG_WALL_RADIUS &&
	Math.abs(y - FLAG_Y) <= FLAG_WALL_RADIUS

const cellValue = (snapshot: AiSnapshot, cx: number, cy: number) => {
	if (cx < 0 || cy < 0 || cx > 25 || cy > 25) return BLOCK_SOLID

	return snapshot.blocked[cy * BLOCK_CELLS + cx]
}

// A side is sealed only if every ring cell holds something: one surviving
// brick still leaves a bullet lane through the hole next to it.
const sideSealed = (
	snapshot: AiSnapshot,
	cells: { cx: number; cy: number }[]
) => cells.every(({ cx, cy }) => cellValue(snapshot, cx, cy) !== BLOCK_FREE)

const ringCells = () => {
	const left: { cx: number; cy: number }[] = []
	const right: { cx: number; cy: number }[] = []
	const top: { cx: number; cy: number }[] = []
	const bottom: { cx: number; cy: number }[] = []

	for (let cy = FLAG_MIN_CELL_Y; cy <= FLAG_MAX_CELL_Y; cy++) {
		left.push({ cx: FLAG_MIN_CELL_X - 1, cy })
		right.push({ cx: FLAG_MAX_CELL_X + 1, cy })
	}
	for (let cx = FLAG_MIN_CELL_X; cx <= FLAG_MAX_CELL_X; cx++) {
		top.push({ cx, cy: FLAG_MAX_CELL_Y + 1 })
		bottom.push({ cx, cy: FLAG_MIN_CELL_Y - 1 })
	}

	return [left, right, top, bottom]
}

const RING = ringCells()

export const flagWall = (
	snapshot: AiSnapshot
): { bricks: number; breached: boolean } => {
	let bricks = 0
	for (const obstacle of snapshot.obstacles) {
		if (!obstacle.destructible) continue
		if (nearFlag(obstacle.x, obstacle.y)) bricks++
	}

	return {
		bricks,
		breached: RING.some((side) => !sideSealed(snapshot, side)),
	}
}

// Same overlap test as isTankBlockedAt: the firing lane leaves the tank's box
// through the brick's box.
const onLine = (lane: number, origin: number) =>
	origin - 7 <= lane && lane <= origin + 14

const laneSign = (direction: TypeDirection) =>
	direction === 'TOP' || direction === 'RIGHT' ? 1 : -1

const laneOffset = (
	from: { x: number; y: number },
	to: { x: number; y: number },
	direction: TypeDirection
) => {
	const vertical = direction === 'TOP' || direction === 'BOTTOM'
	const lateral = Math.abs(
		(vertical ? to.x : to.y) - (vertical ? from.x : from.y)
	)
	const forward =
		((vertical ? to.y : to.x) - (vertical ? from.y : from.x)) *
		laneSign(direction)

	return { lateral, forward }
}

// A drilled brick buys a lane when the next cell behind it is open and an
// enemy stands on that lane inside shooting range.
const opensLane = (snapshot: AiSnapshot, direction: TypeDirection) => {
	const ai = snapshot.ai
	const target = snapshot.enemies.some((enemy) => {
		const { lateral, forward } = laneOffset(ai, enemy, direction)

		return (
			lateral <= HIT_BAND &&
			forward > LANE_STEP &&
			forward <= DRILL_LANE_REACH
		)
	})
	if (!target) return false

	let drilled = false
	for (let step = LANE_STEP; step <= DRILL_LANE_REACH; step += LANE_STEP) {
		const point = advance(ai.x, ai.y, direction, step)
		const value = cellValue(
			snapshot,
			Math.floor(point.x / 8),
			Math.floor(point.y / 8)
		)
		if (value === BLOCK_FREE) continue
		// one shot opens one brick; a second brick behind it is a different job
		if (value === BLOCK_BRICK && !drilled) {
			drilled = true
			continue
		}

		return false
	}

	return true
}

const shortensGoalPath = (
	snapshot: AiSnapshot,
	goal: AiGoal | null,
	direction: TypeDirection
) => {
	if (!goal) return false
	const { lateral, forward } = laneOffset(snapshot.ai, goal, direction)

	return lateral <= HIT_BAND && forward > LANE_STEP
}

const laneValue = (
	snapshot: AiSnapshot,
	direction: TypeDirection,
	goal: AiGoal | null
): number => {
	if (opensLane(snapshot, direction)) return 3
	if (shortensGoalPath(snapshot, goal, direction)) return 2

	return 0
}

export const drillValue = (
	snapshot: AiSnapshot,
	brick: { x: number; y: number },
	goal: AiGoal | null
): number => {
	const ai = snapshot.ai
	let value = 0
	// A corner brick can be shot down either axis; the more valuable one wins.
	if (onLine(ai.x, brick.x))
		value = laneValue(snapshot, brick.y > ai.y ? 'TOP' : 'BOTTOM', goal)
	if (onLine(ai.y, brick.y))
		value = Math.max(
			value,
			laneValue(snapshot, brick.x > ai.x ? 'RIGHT' : 'LEFT', goal)
		)

	return value
}

// One gate for both copies of "is the other player on this firing line". The
// engine's bullet hit box is ±8 (isBulletHitTank), so ±7 leaves a friendly-fire
// hole one pixel wide.
const FRIEND_HIT_BAND = 8

export const friendInLine = (
	ai: { x: number; y: number },
	direction: TypeDirection,
	player: AiSnapshot['player']
) => {
	if (player.dead) return false

	const dx = player.x - ai.x
	const dy = player.y - ai.y
	if (direction === 'TOP') return Math.abs(dx) <= FRIEND_HIT_BAND && dy > 0
	if (direction === 'BOTTOM') return Math.abs(dx) <= FRIEND_HIT_BAND && dy < 0
	if (direction === 'RIGHT') return Math.abs(dy) <= FRIEND_HIT_BAND && dx > 0

	return Math.abs(dy) <= FRIEND_HIT_BAND && dx < 0
}

export const chooseDrill = (
	snapshot: AiSnapshot,
	goal: AiGoal | null,
	features: AiTierFeatures
): { x: number; y: number; direction: TypeDirection } | null => {
	if (!features.brickDrilling) return null

	let best: { x: number; y: number; direction: TypeDirection } | null = null
	let bestValue = 0
	for (const direction of DIRECTIONS) {
		if (friendInLine(snapshot.ai, direction, snapshot.player)) continue
		const point = advance(
			snapshot.ai.x,
			snapshot.ai.y,
			direction,
			LANE_STEP
		)
		const object = obstacleAt(snapshot, point.x, point.y)
		if (!object?.destructible) continue
		// A defender inside the base must never drill its own flag ring:
		// opensLane rewards the brick when an enemy stands beyond it.
		if (goal?.kind === 'defend' && nearFlag(object.x, object.y)) continue

		const value = drillValue(snapshot, { x: object.x, y: object.y }, goal)
		if (value > bestValue) {
			bestValue = value
			best = { x: object.x, y: object.y, direction }
		}
	}

	return best
}
