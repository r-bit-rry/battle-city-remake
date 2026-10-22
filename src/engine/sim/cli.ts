import { abTest, formatAb, parsePolicies } from './ab'

const arg = (name: string, fallback: string) => {
	const i = process.argv.indexOf(`--${name}`)
	return i === -1 ? fallback : process.argv[i + 1]
}

const seeds = arg('seeds', '1,7,42').split(',').map(Number)
const ticks = Number(arg('ticks', '3000'))

if (seeds.some((seed) => !Number.isFinite(seed)) || !(ticks > 0))
	throw new Error(
		'usage: npm run sim -- [--seeds 1,7,42] [--ticks 3000] [--policies "elite:wingman,pro:guardian"] [--json]'
	)

const policies = parsePolicies(arg('policies', 'elite:wingman,pro:guardian'))
const originalRandom = Math.random

try {
	const rows = abTest(policies, seeds, ticks)
	console.log(
		process.argv.includes('--json')
			? JSON.stringify(rows, null, 2)
			: formatAb(rows)
	)
} finally {
	Math.random = originalRandom
}
