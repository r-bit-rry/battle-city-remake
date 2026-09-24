// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bullet } from '../instances'
import { gameFrame } from './index'
import { aiFrameLogic, getAiMemory } from './ai.logic'
import { makeAiGame, makeEnemy } from './ai/ai.test-utils'

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

describe('aiFrameLogic', () => {
	it('does nothing without an aiLevel', () => {
		const game = makeAiGame()
		game.aiLevel = undefined
		game.p2Controls.move = 'TOP'
		game.p2Controls.fire = true

		aiFrameLogic(game)

		expect(game.p2Controls.move).toBe('TOP')
		expect(game.p2Controls.fire).toBe(true)
	})

	it('clears controls while paused or dead', () => {
		const paused = makeAiGame()
		paused.isPaused = true
		paused.p2Controls.move = 'TOP'
		paused.p2Controls.fire = true
		aiFrameLogic(paused)
		expect(paused.p2Controls.move).toBeNull()
		expect(paused.p2Controls.fire).toBe(false)

		const dead = makeAiGame()
		dead.p2!.lives = 0
		dead.p2Controls.move = 'TOP'
		aiFrameLogic(dead)
		expect(dead.p2Controls.move).toBeNull()
	})

	it('selects and caches a goal, then invalidates it after a kill', () => {
		const game = makeAiGame()
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.enemies = [makeEnemy(40, 130)]
		aiFrameLogic(game)

		expect(getAiMemory(game)?.goal?.kind).toBe('engage')
		expect(getAiMemory(game)?.goal?.enemyId).toBe(game.enemies[0].id)

		game.enemies = []
		aiFrameLogic(game)
		expect(getAiMemory(game)?.goal?.kind).not.toBe('engage')
	})

	it('dodges an incoming bullet', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'RIGHT'
		game.bullets = [new Bullet(72, 100, 'RIGHT', 'NORMAL', 'enemy-1')]

		aiFrameLogic(game)

		expect(['TOP', 'BOTTOM']).toContain(game.p2Controls.move)
	})

	it('moves, fires and survives a long beginner run', () => {
		for (const seed of [1, 7, 42]) {
			seedRandom(seed)
			const game = makeAiGame('beginner')
			let moved = false
			for (let i = 0; i < 1200; i++) {
				gameFrame(game)
				if (
					game.p2 &&
					(game.p2.coordinateX !== 136 || game.p2.coordinateY !== 7)
				)
					moved = true
			}

			expect(moved).toBe(true)
			expect(game.p2!.lives).toBeGreaterThan(0)
		}
	})
})
