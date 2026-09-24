// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GameObject } from '../../instances'
import { buildSnapshot, createMemory, inferPlayerIntent } from './ai.perception'
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
