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

const nearestLaneIndex = (value: number) => {
	let best = 0
	for (let i = 1; i < LANE_COUNT; i++) {
		if (Math.abs(LANES[i] - value) < Math.abs(LANES[best] - value)) best = i
	}

	return best
}

const blockersAt = (
	x: number,
	y: number,
	busy: BusyCoordinates[],
	ignoreId?: string
) => {
	let hardBlocked = false
	const bricks: BusyCoordinates[] = []
	for (const object of busy) {
		if (object.id === ignoreId) continue
		if (!isTank(object.type) && !isImpassibleGameObject(object.type))
			continue

		const minX = isTank(object.type)
			? object.coordinateX - 7
			: object.coordinateX
		const minY = isTank(object.type)
			? object.coordinateY - 7
			: object.coordinateY
		const maxX = object.coordinateX + 7
		const maxY = object.coordinateY + 7

		if (x - 7 <= maxX && minX <= x + 7 && y - 7 <= maxY && minY <= y + 7) {
			if (object.type === 'BRICK') bricks.push(object)
			else hardBlocked = true
		}
	}

	return { hardBlocked, bricks }
}

const cellInfo = (
	x: number,
	y: number,
	busy: BusyCoordinates[],
	options: PathOptions
): CellInfo | null => {
	if (x < 7 || x > 200 || y < 7 || y > 200) return null

	const { hardBlocked, bricks } = blockersAt(x, y, busy, options.ignoreId)
	if (hardBlocked) return null
	if (bricks.length) {
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
			const info = cellInfo(LANES[nx], LANES[ny], busy, options)
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
			const info = cellInfo(LANES[xi], LANES[yi], busy, options)
			if (info?.brick) {
				brick = { x: LANES[xi], y: LANES[yi] }
				break
			}
			cursor = parents[cursor]
		}
	}

	return { waypoints, brick }
}
