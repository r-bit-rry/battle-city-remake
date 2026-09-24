// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Game, Tank } from './instances'
import { gameFrame } from './logics'
import { maps } from './maps'
import { isTankBlockedAt } from './utils'

const settings = {
	hardcore: false,
	playerLevel: 1 as const,
	friendlyFire: false,
	survivorRespawn: true,
	soundPack: 'default' as const,
}

const seedRandom = (seedValue = 42) => {
	let seed = seedValue
	vi.spyOn(Math, 'random').mockImplementation(() => {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	})
}

const brick = (x: number, y: number) => ({
	id: `brick-${x}-${y}`,
	type: 'BRICK' as const,
	coordinateX: x,
	coordinateY: y,
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('grid alignment', () => {
	it('snaps the axis perpendicular to facing onto a lane', () => {
		const tank = new Tank('middle', 'NORMAL')

		tank.coordinateX = 78
		tank.direction = 'TOP'
		tank.alignToGrid([])
		expect(tank.coordinateX).toBe(79)

		tank.coordinateX = 74
		tank.direction = 'TOP'
		tank.alignToGrid([])
		expect(tank.coordinateX).toBe(72)

		tank.coordinateY = 78
		tank.direction = 'RIGHT'
		tank.alignToGrid([])
		expect(tank.coordinateY).toBe(79)
	})

	it('clears a corner block after snapping but catches it off-lane', () => {
		const tank = new Tank('middle', 'NORMAL')
		const block = brick(64, 16)

		expect(isTankBlockedAt(tank, 78, 9, [block])).toBe(true)
		expect(isTankBlockedAt(tank, 78, 8, [block])).toBe(false)
		expect(isTankBlockedAt(tank, 79, 9, [block])).toBe(false)
	})

	it('blocks flush blocks and bounds, passes trees and ice', () => {
		const tank = new Tank('middle', 'NORMAL')

		expect(isTankBlockedAt(tank, 73, 8, [brick(80, 8)])).toBe(true)
		expect(isTankBlockedAt(tank, 201, 100, [])).toBe(true)
		expect(
			isTankBlockedAt(tank, 100, 100, [
				{
					id: 'trees',
					type: 'TREES',
					coordinateX: 100,
					coordinateY: 100,
				},
			])
		).toBe(false)
	})
})

describe('survivor respawn', () => {
	it('revives the dead player when the other survived', () => {
		const game = new Game('local', 'p1', 'p2', settings)
		for (let i = 0; i < 200; i++) gameFrame(game)

		game.p1.lives = 0
		game.p2!.lives = 3
		game.resetBetweenLevels(maps.map2)

		expect(game.p1.lives).toBe(1)
		expect(game.p2!.lives).toBe(3)
	})

	it('keeps the dead player out when disabled', () => {
		const game = new Game('local', 'p1', 'p2', {
			...settings,
			survivorRespawn: false,
		})
		for (let i = 0; i < 200; i++) gameFrame(game)

		game.p1.lives = 0
		game.p2!.lives = 3
		game.resetBetweenLevels(maps.map2)

		expect(game.p1.lives).toBe(0)
	})
})

describe('dead players', () => {
	it('cannot move or shoot with 0 lives', () => {
		const game = new Game('local', 'p1', 'p2', settings)
		for (let i = 0; i < 200; i++) gameFrame(game)

		game.p1.lives = 0
		game.p1.deathCooldown = 0
		game.p1.spawnAnimation = 0
		const start = {
			x: game.p1.coordinateX,
			y: game.p1.coordinateY,
		}

		game.p1Controls.move = 'TOP'
		game.p1Controls.fire = true
		for (let i = 0; i < 10; i++) gameFrame(game)

		expect(game.p1.coordinateX).toBe(start.x)
		expect(game.p1.coordinateY).toBe(start.y)
		expect(game.bullets.every((b) => b.shooterId !== game.p1.id)).toBe(true)
	})
})

describe('AI ally', () => {
	it('stays idle without an aiLevel', () => {
		const game = new Game('local', 'p1', 'p2', settings)
		for (let i = 0; i < 400; i++) gameFrame(game)

		expect(game.p2!.coordinateX).toBe(136)
		expect(game.p2!.coordinateY).toBe(7)
	})

	it('moves, fires and survives a long beginner run', () => {
		for (const seedValue of [1, 7, 42]) {
			seedRandom(seedValue)
			const game = new Game(
				'local',
				'p1',
				'p2',
				settings,
				undefined,
				'beginner'
			)
			let moved = false
			let maxBullets = 0

			for (let i = 0; i < 1200; i++) {
				gameFrame(game)
				maxBullets = Math.max(maxBullets, game.bullets.length)
				if (
					game.p2 &&
					(game.p2.coordinateX !== 136 || game.p2.coordinateY !== 7)
				)
					moved = true
			}

			expect(game.frame).toBe(1200)
			expect(moved).toBe(true)
			expect(maxBullets).toBeGreaterThan(0)
			expect(game.p2!.lives).toBeGreaterThan(0)
		}
	})

	it('stores the requested role and defaults to no role', () => {
		const withRole = new Game(
			'local',
			'p1',
			'p2',
			settings,
			undefined,
			'pro',
			'hunter'
		)
		const withoutRole = new Game('local', 'p1', 'p2', settings)

		expect(withRole.aiRole).toBe('hunter')
		expect(withoutRole.aiRole).toBeUndefined()
	})
})
