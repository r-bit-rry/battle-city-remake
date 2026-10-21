// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { abTest, formatAb, parsePolicies } from './ab'

describe('ab', () => {
	it('runs every policy on every seed', () => {
		const rows = abTest(
			{ elite: { tier: 'elite' }, pro: { tier: 'pro' } },
			[1, 7],
			300
		)

		expect(rows).toHaveLength(4)
		for (const row of rows) {
			for (const value of Object.values(row.metrics))
				if (typeof value === 'number')
					expect(Number.isFinite(value)).toBe(true)
		}
	})

	it('prints a fixed-width table with both policies and a header', () => {
		const rows = abTest(
			{ elite: { tier: 'elite' }, pro: { tier: 'pro' } },
			[1],
			120
		)
		const table = formatAb(rows)
		const [header] = table.split('\n')

		expect(header).toContain('policy')
		expect(header).toContain('score')
		expect(table).toContain('elite')
		expect(table).toContain('pro')
	})

	it('parses name=tier:role entries', () => {
		expect(parsePolicies('elite:wingman,hunter=pro:hunter')).toEqual({
			'elite:wingman': { tier: 'elite', role: 'wingman' },
			hunter: { tier: 'pro', role: 'hunter' },
		})
	})
})
