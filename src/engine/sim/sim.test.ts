// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Sim, SimMetrics } from './sim'

// wall-clock timings differ per run; determinism covers everything else
const deterministic = (metrics: SimMetrics) => ({
	...metrics,
	p50Ms: 0,
	p99Ms: 0,
	maxMs: 0,
})

const run = (seed: number) => {
	const sim = new Sim({ seed, tier: 'pro', role: 'wingman' })
	try {
		sim.step(300)
		const p2 = sim.game.p2!
		return {
			metrics: deterministic(sim.metrics()),
			aiXy: [p2.coordinateX, p2.coordinateY],
		}
	} finally {
		sim.dispose()
	}
}

describe('Sim', () => {
	it('advances exactly the requested number of ticks', () => {
		const sim = new Sim({ seed: 7 })
		const before = sim.game.frame
		sim.step(25)
		expect(sim.game.frame - before).toBe(25)
		sim.dispose()
	})

	it('same seed, same run', () => {
		const a = run(7)
		const b = run(7)
		expect(a.metrics).toEqual(b.metrics)
		expect(a.aiXy).toEqual(b.aiXy)
	})

	it('restores Math.random on dispose', () => {
		const original = Math.random
		const sim = new Sim({ seed: 3 })
		sim.dispose()
		expect(Math.random).toBe(original)
	})
})
