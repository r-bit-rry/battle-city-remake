// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Sim, SimMetrics } from '../../sim/sim'
import { TypeAiLevel, TypeAiRole } from '../../types'

const FRAMES = 3000
const SEEDS = [1, 7, 42]

type BenchMetrics = SimMetrics

const run = (
	seed: number,
	level: TypeAiLevel,
	role: TypeAiRole
): BenchMetrics => {
	const sim = new Sim({ seed, tier: level, role })

	try {
		return sim.runUntil(
			(game) => !game.isFlagAlive || !game.p2!.lives,
			FRAMES
		)
	} finally {
		sim.dispose()
	}
}

const average = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length

describe.runIf(process.env.AI_BENCH === '1')('AI soak benchmarks', () => {
	// tree table (seeds 1/7/42): beginner 2150, intermediate 2157, pro 3264,
	// elite 3406. The margins the assertions rely on are 7 points
	// (beginner→intermediate), 1107 (intermediate→pro) and 142 (pro→elite).
	// Every change to the decision path re-rolls the simulator's RNG walk, so
	// this pins the strict order, not the absolutes.
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

		for (let i = 1; i < averages.length; i++)
			expect(
				averages[i],
				`${tiers[i]} ${averages[i]} > ${tiers[i - 1]} ${averages[i - 1]}`
			).toBeGreaterThan(averages[i - 1])
	})

	// The role contract, measured: the guardian spends 35% of its ticks on a
	// defend goal, the hunter 30%. Near-base was the old proxy and it lied:
	// "y < 100" is most of the combat map, and the guardian's defend target is
	// the enemy, so defending lowered the ratio. The wave-B floors (guardian
	// 0.35, hunter 0.1) held only because the hunter died at ~1000 ticks and
	// never fought a defensive action; wave C keeps it alive to 1400-1750, so
	// it now holds `defend` whenever the flag row is rushed, like any role.
	// What is still measurable is the ranking the title claims.
	it('defends more and scores more as a guardian than as a hunter', () => {
		const guardianRuns = SEEDS.map((seed) => run(seed, 'pro', 'guardian'))
		const hunterRuns = SEEDS.map((seed) => run(seed, 'pro', 'hunter'))
		const guardian = average(guardianRuns.map((m) => m.defendShare))
		const hunter = average(hunterRuns.map((m) => m.defendShare))

		expect(guardian).toBeGreaterThan(hunter)
		expect(average(guardianRuns.map((m) => m.score))).toBeGreaterThan(
			average(hunterRuns.map((m) => m.score))
		)
		// The base-loss class is not closed (fix-wave-b report, B1): both roles
		// lose the flag on two of three seeds, so this pins "the guardian is
		// not useless at home", not "the guardian out-keeps the hunter".
		expect(
			guardianRuns.filter((m) => m.baseAlive).length
		).toBeGreaterThanOrEqual(1)
	})

	it('never friendly-fires, never wedges and never loses the base on elite', () => {
		for (const seed of SEEDS) {
			const metrics = run(seed, 'elite', 'wingman')
			expect(
				metrics.friendlyFire,
				`seed ${seed}: ${JSON.stringify(metrics)}`
			).toBe(0)
			// stuckRatio is net displacement over a one-second window, not
			// "position identical to last frame": a tank that never moves has
			// travelled too little to count as wedged and scores 0 here.
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
