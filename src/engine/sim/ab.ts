import { AI_ROLE_PROFILES, AI_TIER_FEATURES } from '../logics/ai/ai.profiles'
import { TypeAiLevel, TypeAiRole } from '../types'
import { Sim, SimMetrics, SimOptions } from './sim'

export interface AbRow {
	policy: string
	seed: number
	metrics: SimMetrics
}

export const abTest = (
	policies: Record<string, Partial<SimOptions>>,
	seeds: number[],
	maxTicks: number
): AbRow[] => {
	const rows: AbRow[] = []

	for (const [policy, options] of Object.entries(policies)) {
		for (const seed of seeds) {
			const sim = new Sim({ ...options, seed })
			try {
				const metrics = sim.runUntil(
					(game) => !game.isFlagAlive || !game.p2!.lives,
					maxTicks
				)
				rows.push({ policy, seed, metrics })
			} finally {
				sim.dispose()
			}
		}
	}

	return rows
}

interface Column {
	name: string
	width: number
	digits: number
	value: (metrics: SimMetrics) => number
}

const COLUMNS: Column[] = [
	{ name: 'ticks', width: 6, digits: 0, value: (m) => m.ticks },
	{ name: 'kills', width: 6, digits: 1, value: (m) => m.kills },
	{ name: 'base', width: 5, digits: 2, value: (m) => (m.baseAlive ? 1 : 0) },
	{ name: 'ai', width: 5, digits: 2, value: (m) => (m.aiAlive ? 1 : 0) },
	{ name: 'stuck', width: 6, digits: 3, value: (m) => m.stuckRatio },
	{ name: 'ff', width: 5, digits: 1, value: (m) => m.friendlyFire },
	{ name: 'p50', width: 6, digits: 2, value: (m) => m.p50Ms },
	{ name: 'p99', width: 6, digits: 2, value: (m) => m.p99Ms },
	{ name: 'max', width: 6, digits: 2, value: (m) => m.maxMs },
	{ name: 'score', width: 7, digits: 0, value: (m) => m.score },
]

const POLICY_WIDTH = 14
const SEED_WIDTH = 5

const line = (policy: string, seed: string, values: number[]) =>
	policy.padEnd(POLICY_WIDTH) +
	seed.padStart(SEED_WIDTH) +
	values
		.map((value, i) =>
			value.toFixed(COLUMNS[i].digits).padStart(COLUMNS[i].width)
		)
		.join('')

const average = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length

export const formatAb = (rows: AbRow[]): string => {
	const header =
		'policy'.padEnd(POLICY_WIDTH) +
		'seed'.padStart(SEED_WIDTH) +
		COLUMNS.map((column) => column.name.padStart(column.width)).join('')
	const separator = '-'.repeat(
		POLICY_WIDTH + SEED_WIDTH + COLUMNS.reduce((w, c) => w + c.width, 0)
	)
	const lines = [header, separator]

	for (const policy of [...new Set(rows.map((row) => row.policy))]) {
		const own = rows.filter((row) => row.policy === policy)
		lines.push(
			line(
				policy,
				'avg',
				COLUMNS.map((column) =>
					average(own.map((row) => column.value(row.metrics)))
				)
			)
		)
		for (const row of own)
			lines.push(
				line(
					policy,
					String(row.seed),
					COLUMNS.map((column) => column.value(row.metrics))
				)
			)
	}

	return lines.join('\n')
}

export const parsePolicies = (
	spec: string
): Record<string, Partial<SimOptions>> =>
	Object.fromEntries(
		spec
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => {
				const [name, body] = entry.includes('=')
					? entry.split('=')
					: [entry, entry]
				const [tier, role] = body.split(':') as [
					TypeAiLevel,
					TypeAiRole,
				]

				if (!(tier in AI_TIER_FEATURES) || !(role in AI_ROLE_PROFILES))
					throw new Error(
						`bad policy "${entry}", expected tier:role or name=tier:role`
					)

				return [name, { tier, role }]
			})
	)
