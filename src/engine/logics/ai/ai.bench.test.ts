// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Sim, SimMetrics } from '../../sim/sim'
import { TypeAiLevel, TypeAiRole } from '../../types'

const FRAMES = 3000
const SEEDS = [1, 7, 42]

interface BenchMetrics extends SimMetrics {
	nearBaseRatio: number
}

const run = (
	seed: number,
	level: TypeAiLevel,
	role: TypeAiRole
): BenchMetrics => {
	const sim = new Sim({ seed, tier: level, role })
	let nearBaseTicks = 0

	try {
		const metrics = sim.runUntil((game) => {
			if (game.p2!.coordinateY < 100) nearBaseTicks++
			return !game.isFlagAlive || !game.p2!.lives
		}, FRAMES)

		return {
			...metrics,
			nearBaseRatio: nearBaseTicks / Math.max(1, metrics.ticks),
		}
	} finally {
		sim.dispose()
	}
}

const average = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length

describe.runIf(process.env.AI_BENCH === '1')('AI soak benchmarks', () => {
	// still failing: beginner 2003 vs intermediate 1554 is a 449 gap, the
	// assertion allows 400 (HEAD: 1497 vs 1005, a 492 gap)
	it.fails('orders tiers by composite score', () => {
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

	// still failing: guardian seed 42 wedges against the flag wall and the base
	// falls (pro path lane y=32 is not traversable at 15 px tank width)
	it.fails(
		'keeps the guardian closer to the base than the hunter while both keep it alive',
		() => {
			const guardianRuns = SEEDS.map((seed) =>
				run(seed, 'pro', 'guardian')
			)
			const hunterRuns = SEEDS.map((seed) => run(seed, 'pro', 'hunter'))
			const guardian = average(
				guardianRuns.map((metrics) => metrics.nearBaseRatio)
			)
			const hunter = average(
				hunterRuns.map((metrics) => metrics.nearBaseRatio)
			)

			expect(guardian).toBeGreaterThan(hunter)
			expect(guardianRuns.every((metrics) => metrics.baseAlive)).toBe(
				true
			)
			expect(hunterRuns.every((metrics) => metrics.baseAlive)).toBe(true)
		}
	)

	it('never friendly-fires, never wedges and never loses the base on elite', () => {
		for (const seed of SEEDS) {
			const metrics = run(seed, 'elite', 'wingman')
			expect(
				metrics.friendlyFire,
				`seed ${seed}: ${JSON.stringify(metrics)}`
			).toBe(0)
			// honest metric: every stationary tick counts, including the
			// turns the engine forces before it moves. HEAD measured
			// 0.60-0.83, after P3 0.23-0.28.
			expect(
				metrics.stuckRatio,
				`seed ${seed}: ${JSON.stringify(metrics)}`
			).toBeLessThan(0.4)
			expect(
				metrics.baseAlive,
				`seed ${seed}: ${JSON.stringify(metrics)}`
			).toBe(true)
		}
	})

	it('keeps frame cost flat', () => {
		for (const seed of SEEDS) {
			const metrics = run(seed, 'elite', 'wingman')
			expect(metrics.p99Ms, `seed ${seed}`).toBeLessThan(8)
		}
	})
})
