// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findPath } from './ai.path'
import { brick, makeEnemy, wallColumn } from './ai.test-utils'

describe('findPath', () => {
	it('finds a straight path along a lane', () => {
		const tank = makeEnemy(40, 40)

		const path = findPath(tank, 120, 40, [], { allowBrick: false })

		expect(path).not.toBeNull()
		expect(path!.waypoints[path!.waypoints.length - 1]).toEqual({
			x: 120,
			y: 40,
		})
		expect(path!.waypoints.every((waypoint) => waypoint.y === 40)).toBe(
			true
		)
		expect(path!.brick).toBeNull()
	})

	it('detours around a wall when brick drilling is off', () => {
		const tank = makeEnemy(40, 40)
		const wall = wallColumn(64, 0, 55)

		const path = findPath(tank, 96, 40, wall, { allowBrick: false })

		expect(path).not.toBeNull()
		expect(path!.waypoints.some((waypoint) => waypoint.y !== 40)).toBe(true)
	})

	it('drills a one-cell brick wall when it is cheaper than the detour', () => {
		const tank = makeEnemy(40, 40)
		const wall = wallColumn(64, 0, 55)

		const path = findPath(tank, 96, 40, wall, { allowBrick: true })

		expect(path).not.toBeNull()
		expect(path!.brick).toEqual({ x: 72, y: 40 })
	})

	it('returns null when the target is sealed by stone', () => {
		const tank = makeEnemy(40, 40)
		const wall = wallColumn(64, 0, 200).map((object) => ({
			...object,
			type: 'STONE' as const,
		}))

		expect(findPath(tank, 96, 40, wall, { allowBrick: true })).toBeNull()
	})

	it('can path into a cell occupied by the ignored target', () => {
		const tank = makeEnemy(40, 40)
		const blocker = {
			...brick(96, 40),
			id: 'enemy-1',
			type: 'NORMAL' as const,
		}

		expect(
			findPath(tank, 96, 40, [blocker], { allowBrick: false })
		).toBeNull()
		expect(
			findPath(tank, 96, 40, [blocker], {
				allowBrick: false,
				ignoreId: 'enemy-1',
			})
		).not.toBeNull()
	})

	it('returns the same path on consecutive searches', () => {
		const tank = makeEnemy(40, 40)
		const wall = wallColumn(64, 0, 55)
		const first = findPath(tank, 96, 40, wall, { allowBrick: true })
		const second = findPath(tank, 96, 40, wall, { allowBrick: true })

		expect(second).toEqual(first)
		expect(second).not.toBe(first)
	})

	it('searches the whole grid without dropping frontier entries', () => {
		// corner to corner on an empty board: expands almost every cell, so the
		// frontier has to grow well past LANE_COUNT * LANE_COUNT entries
		const path = findPath(
			{ id: 'tank', coordinateX: 7, coordinateY: 7 },
			200,
			200,
			[],
			{ allowBrick: false }
		)

		expect(path).not.toBeNull()
		expect(path!.waypoints).toHaveLength(98)
		expect(path!.waypoints[97]).toEqual({ x: 200, y: 200 })
	})
})
