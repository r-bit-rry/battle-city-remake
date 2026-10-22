// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GameObject } from '../../instances'
import {
	buildSnapshot,
	createMemory,
	goalStalled,
	inferPlayerIntent,
	wedgedInWindow,
} from './ai.perception'
import { makeAiGame, makeBonus, makeEnemy } from './ai.test-utils'

describe('buildSnapshot', () => {
	it('captures enemies, bullets, bonuses and obstacles', () => {
		const game = makeAiGame()
		game.enemies = [makeEnemy(100, 100, 'SPEEDY', 'STAR')]
		game.bonuses = [makeBonus(40, 40, 'HELMET')]
		game.objects = [
			new GameObject('BRICK', 4, 4),
			new GameObject('WATER', 5, 5),
		]

		const snapshot = buildSnapshot(game, createMemory())

		expect(snapshot.enemies).toHaveLength(1)
		expect(snapshot.enemies[0].speed).toBe(2)
		expect(snapshot.enemies[0].carrier).toBe(true)
		expect(snapshot.bonuses[0].type).toBe('HELMET')
		expect(snapshot.obstacles).toHaveLength(2)
		expect(
			snapshot.obstacles.find((o) => o.destructible)?.blocksBullets
		).toBe(true)
		expect(
			snapshot.obstacles.find((o) => !o.destructible)?.blocksBullets
		).toBe(false)
	})

	it('ignores spawning enemies', () => {
		const game = makeAiGame()
		const spawning = makeEnemy(100, 100)
		spawning.spawnAnimation = 50
		game.enemies = [spawning]

		expect(buildSnapshot(game, createMemory()).enemies).toHaveLength(0)
	})

	it('changes the map signature when a brick disappears', () => {
		const game = makeAiGame()
		game.objects = [new GameObject('BRICK', 4, 4)]
		const memory = createMemory()
		const before = buildSnapshot(game, memory).mapSignature
		game.objects = []

		expect(buildSnapshot(game, memory).mapSignature).not.toBe(before)
	})

	it('marks one cell per bullet-blocking obstacle', () => {
		const game = makeAiGame()
		game.objects = [
			new GameObject('BRICK', 4, 4),
			new GameObject('STONE', 5, 4),
			new GameObject('WATER', 6, 4),
			new GameObject('FLAG', 7, 4),
		]

		const snapshot = buildSnapshot(game, createMemory())
		const cell = (tileX: number, tileY: number) =>
			snapshot.blocked[tileY * 32 + tileX]

		expect(snapshot.blocked).toHaveLength(32 * 32)
		expect(cell(4, 4)).toBe(1)
		expect(cell(5, 4)).toBe(2)
		expect(cell(6, 4)).toBe(0)
		expect(cell(7, 4)).toBe(3)
		expect(cell(0, 0)).toBe(0)
	})
})

describe('inferPlayerIntent', () => {
	const player = {
		x: 100,
		y: 100,
		direction: 'TOP' as const,
		lives: 3,
		dead: false,
	}

	it('detects pushing, holding and retreating from the track', () => {
		expect(
			inferPlayerIntent(
				[
					{ x: 100, y: 60 },
					{ x: 100, y: 100 },
				],
				player
			)
		).toBe('pushing')
		expect(
			inferPlayerIntent(
				[
					{ x: 100, y: 120 },
					{ x: 100, y: 110 },
				],
				player
			)
		).toBe('holding')
		expect(
			inferPlayerIntent(
				[
					{ x: 100, y: 140 },
					{ x: 100, y: 100 },
				],
				player
			)
		).toBe('retreating')
	})

	it('reports dead and low-life states', () => {
		expect(inferPlayerIntent([], { ...player, dead: true })).toBe('dead')
		expect(inferPlayerIntent([], { ...player, lives: 0 })).toBe('dead')
		expect(inferPlayerIntent([], { ...player, lives: 1 })).toBe(
			'retreating'
		)
	})
})

describe('wedgedInWindow', () => {
	it('sees a limit cycle that moves a pixel every tick', () => {
		// the guardian wedge: x=127, y 24..40, never more than 2 px from where
		// the window opened, although the tank moves on every tick
		const track = Array.from({ length: 60 }, (_, i) => ({
			x: 127 + (i % 2),
			y: 24 + (i % 2),
		}))

		expect(
			wedgedInWindow(track, track[track.length - 1].x, track[0].y)
		).toBe(true)
	})

	it('does not call standing still a wedge', () => {
		const track = Array.from({ length: 60 }, () => ({ x: 103, y: 31 }))

		expect(wedgedInWindow(track, 103, 31)).toBe(false)
	})

	it('sees progress once the window spans a real walk', () => {
		expect(wedgedInWindow([{ x: 100, y: 100 }], 108, 100)).toBe(false)
		expect(
			wedgedInWindow(
				[
					{ x: 100, y: 100 },
					{ x: 108, y: 100 },
				],
				108,
				100
			)
		).toBe(false)
		expect(wedgedInWindow([], 40, 100)).toBe(false)
	})
})

describe('goalStalled', () => {
	const frames = (
		goal: Parameters<typeof goalStalled>[1],
		step: (tick: number) => { x: number; y: number },
		count = 60
	) => {
		const memory = createMemory()
		let stalled = false
		for (let tick = 0; tick < count; tick++) {
			const { x, y } = step(tick)
			stalled = goalStalled(memory, goal, x, y, 8)
		}

		return stalled
	}

	it('reports a goal the tank circles without closing', () => {
		// the pro:guardian seed-1 limit cycle: x 127 <-> 143 at y 7, goal fixed
		expect(
			frames({ kind: 'patrol', x: 103, y: 31 }, (tick) => ({
				x: 127 + (tick % 17),
				y: 7,
			}))
		).toBe(true)
	})

	it('does not report a goal that is being reached', () => {
		expect(
			frames({ kind: 'patrol', x: 103, y: 31 }, (tick) => ({
				x: 160 - tick,
				y: 100,
			}))
		).toBe(false)
	})

	it('does not report a target that moves every tick', () => {
		// an engage goal follows the enemy; the window restarts with it
		const memory = createMemory()
		let stalled = false
		for (let tick = 0; tick < 60; tick++) {
			stalled = goalStalled(
				memory,
				{ kind: 'engage', x: 60, y: 60 + tick, enemyId: 'e' },
				160,
				100,
				8
			)
		}

		expect(stalled).toBe(false)
	})

	it('does not report a held position or a goal already reached', () => {
		expect(
			frames({ kind: 'defend', x: 103, y: 31 }, () => ({
				x: 160,
				y: 100,
			}))
		).toBe(false)
		expect(
			frames({ kind: 'patrol', x: 160, y: 100 }, () => ({
				x: 160,
				y: 100,
			}))
		).toBe(false)
	})

	it('needs a full window before it reports', () => {
		expect(
			frames(
				{ kind: 'patrol', x: 103, y: 31 },
				() => ({ x: 160, y: 100 }),
				59
			)
		).toBe(false)
	})
})
