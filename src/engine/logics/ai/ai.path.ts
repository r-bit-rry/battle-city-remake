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

const GRID_FREE = 0
const GRID_BRICK = 1
const GRID_BLOCKED = 2

const TANK_REACH = 14
const OBSTACLE_MIN_REACH = 7
const OBSTACLE_MAX_REACH = 14

export const nearestLaneIndex = (value: number) => {
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
	grid.fill(GRID_FREE)
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
}

// readCell results; out-params keep the search allocation free
let cellCost = 0

const readCell = (xi: number, yi: number, options: PathOptions): boolean => {
	const x = LANES[xi]
	const y = LANES[yi]
	if (x < 7 || x > 200 || y < 7 || y > 200) return false

	const value = grid[yi * LANE_COUNT + xi]
	if (value === GRID_BLOCKED) return false
	if (value === GRID_BRICK) {
		if (!options.allowBrick) return false

		cellCost = 3

		return true
	}

	let cost = 1
	const frame = options.danger?.cells.get(yi * LANE_COUNT + xi)
	if (frame !== undefined && options.dangerPenalty) {
		const horizon = options.dangerHorizon ?? 30
		cost += options.dangerPenalty * Math.max(0, 1 - frame / horizon)
	}
	cellCost = cost

	return true
}

const heuristic = (a: number, b: number) => {
	const ax = a % LANE_COUNT
	const ay = (a - ax) / LANE_COUNT
	const bx = b % LANE_COUNT
	const by = (b - bx) / LANE_COUNT

	return (Math.abs(ax - bx) + Math.abs(ay - by)) / 8
}

// shortcut: module-scope scratch, so findPath must not be re-entered. It is
// never recursive and the engine is single threaded.
const total = LANE_COUNT * LANE_COUNT
const grid = new Uint8Array(total)
const cost = new Float64Array(total)
const parents = new Int32Array(total)
const closed = new Uint8Array(total)
// one start push plus at most one relaxation per incoming edge of every cell
const HEAP_LIMIT = total * 4 + 1
const heapPriority = new Float64Array(HEAP_LIMIT)
const heapNode = new Int32Array(HEAP_LIMIT)
let heapSize = 0

const heapPush = (node: number, priority: number) => {
	if (heapSize >= HEAP_LIMIT) return

	let index = heapSize++
	heapNode[index] = node
	heapPriority[index] = priority
	while (index > 0) {
		const parent = (index - 1) >> 1
		if (heapPriority[parent] <= heapPriority[index]) break

		const parentNode = heapNode[parent]
		const parentPriority = heapPriority[parent]
		heapNode[parent] = heapNode[index]
		heapPriority[parent] = heapPriority[index]
		heapNode[index] = parentNode
		heapPriority[index] = parentPriority
		index = parent
	}
}

const heapPop = () => {
	const top = heapNode[0]
	heapSize--
	if (heapSize > 0) {
		heapNode[0] = heapNode[heapSize]
		heapPriority[0] = heapPriority[heapSize]
		let index = 0
		for (;;) {
			const left = index * 2 + 1
			const right = left + 1
			let smallest = index
			if (left < heapSize && heapPriority[left] < heapPriority[smallest])
				smallest = left
			if (
				right < heapSize &&
				heapPriority[right] < heapPriority[smallest]
			)
				smallest = right
			if (smallest === index) break

			const smallestNode = heapNode[smallest]
			const smallestPriority = heapPriority[smallest]
			heapNode[smallest] = heapNode[index]
			heapPriority[smallest] = heapPriority[index]
			heapNode[index] = smallestNode
			heapPriority[index] = smallestPriority
			index = smallest
		}
	}

	return top
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
	if (startIndex === goalIndex) return { waypoints: [] }

	buildGrid(busy, options.ignoreId)
	cost.fill(Infinity)
	parents.fill(-1)
	closed.fill(0)
	heapSize = 0

	cost[startIndex] = 0
	heapPush(startIndex, heuristic(startIndex, goalIndex))

	while (heapSize) {
		const current = heapPop()
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
			if (!readCell(nx, ny, options)) continue

			const tentative = cost[current] + cellCost
			if (tentative < cost[next]) {
				cost[next] = tentative
				parents[next] = current
				heapPush(next, tentative + heuristic(next, goalIndex))
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

	return { waypoints }
}
