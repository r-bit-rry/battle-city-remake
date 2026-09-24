// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TypeAiLevel, TypeAiRole } from '../../types'
import { isEnemy } from '../../utils'
import { gameFrame } from '../index'
import { aiSettings, makeAiGame } from './ai.test-utils'

const FRAMES = 3000
const SEEDS = [1, 7, 42]

interface Metrics {
	score: number
	baseAlive: boolean
	stuckRatio: number
	friendlyFire: number
	nearBaseRatio: number
}

const run = (seed: number, level: TypeAiLevel, role: TypeAiRole): Metrics => {
	let value = seed
	vi.spyOn(Math, 'random').mockImplementation(() => {
		value |= 0
		value = (value + 0x6d2b79f5) | 0
		let t = Math.imul(value ^ (value >>> 15), 1 | value)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	})

	const game = makeAiGame(level, role, { ...aiSettings, friendlyFire: true })
	const seen = new Set<string>()
	let kills = 0
	let lastLevel = game.level
	let stuckFrames = 0
	let movingFrames = 0
	let nearBaseFrames = 0
	let friendlyFire = 0
	let survived = 0

	for (let i = 0; i < FRAMES; i++) {
		const p2 = game.p2!
		const beforeX = p2.coordinateX
		const beforeY = p2.coordinateY
		const p1LivesBefore = game.p1.lives
		const move = game.p2Controls.move

		gameFrame(game)
		survived = i + 1

		if (game.level !== lastLevel) {
			seen.clear()
			lastLevel = game.level
		}
		for (const enemy of game.enemies) seen.add(enemy.id)
		for (const id of [...seen]) {
			if (!game.enemies.some((enemy) => enemy.id === id)) {
				seen.delete(id)
				kills++
			}
		}
		if (move !== null) {
			movingFrames++
			if (p2.coordinateX === beforeX && p2.coordinateY === beforeY)
				stuckFrames++
		}
		if (p2.coordinateY < 100) nearBaseFrames++
		if (game.p1.lives < p1LivesBefore) {
			const nearP1 = game.bullets.filter(
				(bullet) =>
					Math.abs(bullet.coordinateX - game.p1.coordinateX) <= 8 &&
					Math.abs(bullet.coordinateY - game.p1.coordinateY) <= 8
			)
			if (
				nearP1.some((bullet) => !isEnemy(bullet.shooter)) &&
				!nearP1.some((bullet) => isEnemy(bullet.shooter))
			)
				friendlyFire++
		}

		if (!game.isFlagAlive || !p2.lives) break
	}

	const baseAlive = game.isFlagAlive
	const score = survived + 50 * kills - 500 * (baseAlive ? 0 : 1)

	return {
		score,
		baseAlive,
		stuckRatio: movingFrames ? stuckFrames / movingFrames : 0,
		friendlyFire,
		nearBaseRatio: nearBaseFrames / FRAMES,
	}
}

const average = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length

afterEach(() => vi.restoreAllMocks())

describe('AI soak benchmarks', () => {
	it('orders tiers by composite score', () => {
		const tiers: TypeAiLevel[] = [
			'beginner',
			'intermediate',
			'pro',
			'elite',
		]
		const averages = tiers.map((tier) =>
			average(SEEDS.map((seed) => run(seed, tier, 'wingman').score))
		)

		expect(averages[3]).toBeGreaterThan(averages[0])
		expect(averages[2]).toBeGreaterThan(averages[1])
		for (let i = 1; i < averages.length; i++) {
			expect(averages[i]).toBeGreaterThanOrEqual(averages[i - 1] - 400)
		}
	})

	it('keeps the guardian closer to the base than the hunter', () => {
		const guardian = average(
			SEEDS.map((seed) => run(seed, 'pro', 'guardian').nearBaseRatio)
		)
		const hunter = average(
			SEEDS.map((seed) => run(seed, 'pro', 'hunter').nearBaseRatio)
		)

		expect(guardian).toBeGreaterThan(hunter)
	})

	it('never friendly-fires, never wedges and never loses the base on elite', () => {
		for (const seed of SEEDS) {
			const metrics = run(seed, 'elite', 'wingman')
			expect(metrics.friendlyFire).toBe(0)
			expect(metrics.stuckRatio).toBeLessThan(0.05)
			expect(metrics.baseAlive).toBe(true)
		}
	})
})
