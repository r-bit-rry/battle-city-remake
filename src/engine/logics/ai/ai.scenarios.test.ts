// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameObject } from '../../instances'
import { gameFrame } from '../index'
import { aiFrameLogic, getAiMemory } from '../ai.logic'
import { makeAiGame, makeEnemy } from './ai.test-utils'

const brickColumn = (tileX: number, fromTileY: number, toTileY: number) =>
	Array.from(
		{ length: toTileY - fromTileY + 1 },
		(_, i) => new GameObject('BRICK', tileX, fromTileY + i)
	)

const seedRandom = (seedValue: number) => {
	let seed = seedValue
	vi.spyOn(Math, 'random').mockImplementation(() => {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	})
}

afterEach(() => vi.restoreAllMocks())

describe('AI ally scenarios', () => {
	it('defends the base when an enemy rushes it', () => {
		seedRandom(7)
		const game = makeAiGame('pro')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 100
		game.enemies = [makeEnemy(103, 40)]
		game.objects = []

		for (let i = 0; i < 10; i++) gameFrame(game)

		expect(getAiMemory(game)?.goal?.kind).toBe('defend')
		expect(getAiMemory(game)?.goal?.enemyId).toBe(game.enemies[0].id)
	})

	it('drills a brick wall that seals the route to a target', () => {
		seedRandom(11)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 150
		game.p1.coordinateY = 150
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.enemies = [makeEnemy(120, 40)]
		game.objects = brickColumn(8, 0, 24)
		const bricksBefore = game.objects.length

		for (let i = 0; i < 120; i++) gameFrame(game)

		expect(game.objects.length).toBeLessThan(bricksBefore)
	})

	it('covers the base while the player pushes', () => {
		seedRandom(21)
		const game = makeAiGame('pro', 'wingman')
		game.levelChangeAnimation = 0
		game.p2!.coordinateX = 136
		game.p2!.coordinateY = 60
		game.enemies = [makeEnemy(200, 160)]

		for (let i = 0; i < 200; i++) {
			game.p1Controls.move = 'TOP'
			gameFrame(game)
		}

		const memory = getAiMemory(game)
		expect(['support', 'defend', 'patrol']).toContain(memory?.goal?.kind)
		expect(game.p2!.coordinateY).toBeLessThan(120)
	})

	it('guards the base when the player is out of lives', () => {
		seedRandom(3)
		const game = makeAiGame('pro')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 150
		game.p1.lives = 0
		game.enemies = [makeEnemy(200, 200)]
		const distanceToBase = () =>
			Math.hypot(game.p2!.coordinateX - 103, game.p2!.coordinateY - 31)
		const startDistance = distanceToBase()

		for (let i = 0; i < 60; i++) gameFrame(game)

		const memory = getAiMemory(game)
		expect(memory?.goal?.kind).toBe('patrol')
		expect(memory?.goal?.x).toBe(103)
		expect(memory?.goal?.y).toBe(31)
		expect(distanceToBase()).toBeLessThan(startDistance)
		expect(game.p2!.coordinateY).toBeLessThan(140)
	})

	it('kills an isolated enemy in a 1v1 duel', () => {
		seedRandom(42)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 60
		game.p2!.coordinateY = 40
		game.enemies = [makeEnemy(120, 40)]
		game.objects = []
		const enemyId = game.enemies[0].id

		for (let i = 0; i < 600; i++) gameFrame(game)

		expect(game.enemies.some((enemy) => enemy.id === enemyId)).toBe(false)
	})

	it('regroups when hurt and outnumbered as the guardian', () => {
		seedRandom(9)
		const game = makeAiGame('pro', 'guardian')
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p2!.lives = 2
		game.enemies = [makeEnemy(40, 140), makeEnemy(60, 130)]

		aiFrameLogic(game)

		expect(getAiMemory(game)?.goal?.kind).toBe('retreat')
	})
})
