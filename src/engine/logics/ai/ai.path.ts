import { BusyCoordinates } from '../../types'
import { isImpassibleGameObject, isTank } from '../../utils'
import { DangerMap, LanePath } from './ai.types'

export const LANES: number[] = []
for (let value = 7; value <= 200; value++) {
	if (value % 8 === 0 || value % 8 === 7) LANES.push(value)
}
export const LANE_COUNT = LANES.length

export interface PathOptions {
	allowBrick: boolean
	danger?: DangerMap
	dangerPenalty?: number
	dangerHorizon?: number
	ignoreId?: string
}

interface CellInfo {
	cost: number
	brick: boolean
}

const GRID_FREE = 0
const GRID_BRICK = 1
const GRID_BLOCKED = 2

const TANK_REACH = 14
const OBSTACLE_MIN_REACH = 7
const OBSTACLE_MAX_REACH = 14

const nearestLaneIndex = (value: number) => {
	let best = 0
	for (let i = 1; i < LANE_COUNT; i++) {
		if (Math.abs(LANES[i] - value) < Math.abs(LANES[best] - value)) best = i
	}

	return best
}

const lowerBound = (target: number) => {
	let low = 0
	let high = LANE_COUNT
	while (low < high) {
		const mid = (low + high) >> 1
		if (LANES[mid] < target) low = mid + 1
		else high = mid
	}

	return low
}

const upperBound = (target: number) => {
	let low = 0
	let high = LANE_COUNT
	while (low < high) {
		const mid = (low + high) >> 1
		if (LANES[mid] <= target) low = mid + 1
		else high = mid
	}

	return low
}

const markBlocked = (
	grid: Uint8Array,
	minX: number,
	maxX: number,
	minY: number,
	maxY: number,
	value: number
) => {
	const xStart = lowerBound(minX)
	const xEnd = upperBound(maxX)
	const yStart = lowerBound(minY)
	const yEnd = upperBound(maxY)

	for (let yi = yStart; yi < yEnd; yi++) {
		const row = yi * LANE_COUNT
		for (let xi = xStart; xi < xEnd; xi++) {
			const index = row + xi
			if (value === GRID_BLOCKED || grid[index] === GRID_FREE)
				grid[index] = value
		}
	}
}

const buildGrid = (busy: BusyCoordinates[], ignoreId?: string) => {
	const grid = new Uint8Array(LANE_COUNT * LANE_COUNT)
	for (const object of busy) {
		if (object.id === ignoreId) continue

		if (isTank(object.type)) {
			markBlocked(
				grid,
				object.coordinateX - TANK_REACH,
				object.coordinateX + TANK_REACH,
				object.coordinateY - TANK_REACH,
				object.coordinateY + TANK_REACH,
				GRID_BLOCKED
			)
		} else if (isImpassibleGameObject(object.type)) {
			markBlocked(
				grid,
				object.coordinateX - OBSTACLE_MIN_REACH,
				object.coordinateX + OBSTACLE_MAX_REACH,
				object.coordinateY - OBSTACLE_MIN_REACH,
				object.coordinateY + OBSTACLE_MAX_REACH,
				object.type === 'BRICK' ? GRID_BRICK : GRID_BLOCKED
			)
		}
	}

	return grid
}

const cellInfo = (
	xi: number,
	yi: number,
	grid: Uint8Array,
	options: PathOptions
): CellInfo | null => {
	const x = LANES[xi]
	const y = LANES[yi]
	if (x < 7 || x > 200 || y < 7 || y > 200) return null

	const value = grid[yi * LANE_COUNT + xi]
	if (value === GRID_BLOCKED) return null
	if (value === GRID_BRICK) {
		if (!options.allowBrick) return null

		return { cost: 3, brick: true }
	}

	let cost = 1
	const frame = options.danger?.cells.get(`${x},${y}`)
	if (frame !== undefined && options.dangerPenalty) {
		const horizon = options.dangerHorizon ?? 30
		cost += options.dangerPenalty * Math.max(0, 1 - frame / horizon)
	}

	return { cost, brick: false }
}

const heuristic = (a: number, b: number) => {
	const ax = a % LANE_COUNT
	const ay = (a - ax) / LANE_COUNT
	const bx = b % LANE_COUNT
	const by = (b - bx) / LANE_COUNT

	return (Math.abs(ax - bx) + Math.abs(ay - by)) / 8
}

class MinHeap {
	private items: { node: number; priority: number }[] = []

	get size() {
		return this.items.length
	}

	push(node: number, priority: number) {
		const items = this.items
		items.push({ node, priority })
		let index = items.length - 1
		while (index > 0) {
			const parent = (index - 1) >> 1
			if (items[parent].priority <= items[index].priority) break
			;[items[parent], items[index]] = [items[index], items[parent]]
			index = parent
		}
	}

	pop() {
		const items = this.items
		const top = items[0]
		const last = items.pop() as { node: number; priority: number }
		if (items.length) {
			items[0] = last
			let index = 0
			for (;;) {
				const left = index * 2 + 1
				const right = left + 1
				let smallest = index
				if (
					left < items.length &&
					items[left].priority < items[smallest].priority
				)
					smallest = left
				if (
					right < items.length &&
					items[right].priority < items[smallest].priority
				)
					smallest = right
				if (smallest === index) break
				;[items[smallest], items[index]] = [
					items[index],
					items[smallest],
				]
				index = smallest
			}
		}

		return top.node
	}
}

const NEIGHBORS = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
]

export const findPath = (
	tank: { id: string; coordinateX: number; coordinateY: number },
	targetX: number,
	targetY: number,
	busy: BusyCoordinates[],
	options: PathOptions
): LanePath | null => {
	const startIndex =
		nearestLaneIndex(tank.coordinateY) * LANE_COUNT +
		nearestLaneIndex(tank.coordinateX)
	const goalIndex =
		nearestLaneIndex(targetY) * LANE_COUNT + nearestLaneIndex(targetX)
	if (startIndex === goalIndex) return { waypoints: [], brick: null }

	const grid = buildGrid(busy, options.ignoreId)
	const total = LANE_COUNT * LANE_COUNT
	const cost = new Float64Array(total).fill(Infinity)
	const parents = new Int32Array(total).fill(-1)
	const closed = new Uint8Array(total)
	const open = new MinHeap()

	cost[startIndex] = 0
	open.push(startIndex, heuristic(startIndex, goalIndex))

	while (open.size) {
		const current = open.pop()
		if (closed[current]) continue
		closed[current] = 1
		if (current === goalIndex) break

		const xi = current % LANE_COUNT
		const yi = (current - xi) / LANE_COUNT

		for (const [dx, dy] of NEIGHBORS) {
			const nx = xi + dx
			const ny = yi + dy
			if (nx < 0 || nx >= LANE_COUNT || ny < 0 || ny >= LANE_COUNT)
				continue

			const next = ny * LANE_COUNT + nx
			const info = cellInfo(nx, ny, grid, options)
			if (!info) continue

			const tentative = cost[current] + info.cost
			if (tentative < cost[next]) {
				cost[next] = tentative
				parents[next] = current
				open.push(next, tentative + heuristic(next, goalIndex))
			}
		}
	}

	if (parents[goalIndex] === -1) return null

	const waypoints: { x: number; y: number }[] = []
	let node = goalIndex
	while (node !== startIndex) {
		const xi = node % LANE_COUNT
		const yi = (node - xi) / LANE_COUNT
		waypoints.push({ x: LANES[xi], y: LANES[yi] })
		node = parents[node]
	}
	waypoints.reverse()

	let brick: { x: number; y: number } | null = null
	if (options.allowBrick) {
		let cursor = goalIndex
		while (cursor !== startIndex) {
			const xi = cursor % LANE_COUNT
			const yi = (cursor - xi) / LANE_COUNT
			const info = cellInfo(xi, yi, grid, options)
			if (info?.brick) {
				brick = { x: LANES[xi], y: LANES[yi] }
				break
			}
			cursor = parents[cursor]
		}
	}

	return { waypoints, brick }
}
