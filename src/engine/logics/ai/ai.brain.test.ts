// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AI_ROLE_PROFILES, AI_TIER_FEATURES } from './ai.profiles'
import { buildSnapshot, createMemory } from './ai.perception'
import { computeThreats } from './ai.threat'
import { bonusValue, collectGoal, isGoalValid, selectGoal } from './ai.brain'
import { makeAiGame, makeBonus, makeEnemy } from './ai.test-utils'
import { AiBonusSnapshot } from './ai.types'

const setup = (
	game: ReturnType<typeof makeAiGame>,
	memory = createMemory()
) => {
	const snapshot = buildSnapshot(game, memory)
	const threats = computeThreats(snapshot)

	return { snapshot, threats, memory }
}

describe('bonusValue', () => {
	it('values a star more at low tank level and HP only when hurt', () => {
		const game = makeAiGame()
		const { snapshot, threats } = setup(game)
		const star: AiBonusSnapshot = {
			id: 'star',
			x: 40,
			y: 40,
			type: 'STAR',
			lifeTime: 0,
		}
		const hp: AiBonusSnapshot = {
			id: 'hp',
			x: 40,
			y: 40,
			type: 'HP',
			lifeTime: 0,
		}

		expect(bonusValue(snapshot, star, AI_TIER_FEATURES.pro, threats)).toBe(
			1
		)
		expect(bonusValue(snapshot, hp, AI_TIER_FEATURES.pro, threats)).toBe(
			0.2
		)
		game.p2!.lives = 2
		expect(
			bonusValue(
				buildSnapshot(game, createMemory()),
				hp,
				AI_TIER_FEATURES.pro,
				threats
			)
		).toBe(1)
	})

	it('returns zero when bonus logic is disabled', () => {
		const game = makeAiGame('beginner')
		const { snapshot, threats } = setup(game)

		expect(
			bonusValue(
				snapshot,
				{ id: 'star', x: 40, y: 40, type: 'STAR', lifeTime: 0 },
				AI_TIER_FEATURES.beginner,
				threats
			)
		).toBe(0)
	})
})

describe('selectGoal', () => {
	it('prefers base defense over a nearer enemy', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.enemies = [makeEnemy(40, 130), makeEnemy(100, 20)]
		const { snapshot, threats, memory } = setup(game)

		const goal = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(goal?.kind).toBe('defend')
		expect(goal?.enemyId).toBe(game.enemies[1].id)
	})

	it('keeps the current goal while its score is close', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.enemies = [makeEnemy(40, 130)]
		const { snapshot, threats, memory } = setup(game)
		const first = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)
		memory.goal = first
		const second = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(second?.kind).toBe(first?.kind)
		expect(second?.enemyId).toBe(first?.enemyId)
	})

	it('refreshes a retained patrol anchor when the player moves', () => {
		const game = makeAiGame('beginner')
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		const { snapshot, threats, memory } = setup(game)
		const first = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.beginner,
			AI_ROLE_PROFILES.wingman,
			memory
		)
		expect(first?.kind).toBe('patrol')
		memory.goal = first

		game.p1.coordinateX = 180
		game.p1.coordinateY = 180
		const next = setup(game, memory)
		const second = selectGoal(
			next.snapshot,
			next.threats,
			AI_TIER_FEATURES.beginner,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(second?.kind).toBe('patrol')
		expect(second?.x).toBe(180)
		expect(second?.y).toBe(180)
	})

	it('retains a reached patrol goal at the anchor', () => {
		const game = makeAiGame('pro')
		game.p1.lives = 0
		game.enemies = [makeEnemy(200, 200)]
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		const { snapshot, threats, memory } = setup(game)
		const first = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)
		expect(first?.kind).toBe('patrol')
		memory.goal = first

		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 40
		const next = setup(game, memory)
		const second = selectGoal(
			next.snapshot,
			next.threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(second?.kind).toBe('patrol')
		expect(second?.x).toBe(103)
		expect(second?.y).toBe(31)
	})

	it('keeps a retained engage target with pre-fix coordinates', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.enemies = [makeEnemy(40, 130)]
		const { snapshot, threats, memory } = setup(game)
		const first = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)
		expect(first?.kind).toBe('engage')
		memory.goal = first

		game.enemies[0].coordinateX = 60
		game.enemies[0].coordinateY = 140
		const next = setup(game, memory)
		const second = selectGoal(
			next.snapshot,
			next.threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(second?.kind).toBe('engage')
		expect(second?.enemyId).toBe(first?.enemyId)
		expect(second?.x).toBe(40)
		expect(second?.y).toBe(130)
	})

	it('drops a stale enemy goal and re-selects', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.enemies = [makeEnemy(40, 130)]
		const { snapshot, threats, memory } = setup(game)
		selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)
		game.enemies = []
		const next = setup(game, memory)

		const goal = selectGoal(
			next.snapshot,
			next.threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(goal?.kind).not.toBe('defend')
		expect(goal?.enemyId).toBeUndefined()
	})

	it('keeps a contested bonus at a third of its value', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 120
		game.p1.coordinateX = 200
		game.p1.coordinateY = 200
		game.bonuses = [makeBonus(103, 50)]
		// 10 px from the bonus: 20 px closer than the AI is
		game.enemies = [makeEnemy(103, 60)]
		const contested = setup(game)
		const contestedGoal = collectGoal(
			contested.snapshot,
			AI_TIER_FEATURES.pro,
			contested.threats
		)

		game.enemies = []
		const solo = setup(game)
		const soloGoal = collectGoal(solo.snapshot, AI_TIER_FEATURES.pro, [])

		expect(contestedGoal?.score).toBeGreaterThan(0)
		expect(contestedGoal!.score / soloGoal!.score).toBeCloseTo(0.3)
	})

	it('yields a contested bonus when the player is closer (elite)', () => {
		const game = makeAiGame('elite')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.bonuses = [makeBonus(90, 100)]
		const { snapshot, threats, memory } = setup(game)

		const goal = selectGoal(
			snapshot,
			threats,
			AI_TIER_FEATURES.elite,
			AI_ROLE_PROFILES.wingman,
			memory
		)

		expect(goal?.kind).not.toBe('collect')
	})

	it('sends the hunter after enemies and the guardian home', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		game.p1.lives = 0
		game.enemies = [makeEnemy(140, 160)]
		const hunter = setup(game, createMemory())
		const guardian = setup(game, createMemory())

		const hunterGoal = selectGoal(
			hunter.snapshot,
			hunter.threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.hunter,
			hunter.memory
		)
		const guardianGoal = selectGoal(
			guardian.snapshot,
			guardian.threats,
			AI_TIER_FEATURES.pro,
			AI_ROLE_PROFILES.guardian,
			guardian.memory
		)

		expect(hunterGoal?.kind).toBe('engage')
		expect(guardianGoal?.kind).toBe('patrol')
	})

	it('validates enemy and bonus goals against the snapshot', () => {
		const game = makeAiGame('pro')
		const { snapshot } = setup(game)

		expect(
			isGoalValid(
				{ kind: 'engage', x: 0, y: 0, enemyId: 'missing' },
				snapshot
			)
		).toBe(false)
		expect(
			isGoalValid(
				{ kind: 'collect', x: 0, y: 0, bonusId: 'missing' },
				snapshot
			)
		).toBe(false)
		expect(isGoalValid({ kind: 'patrol', x: 0, y: 0 }, snapshot)).toBe(true)
	})
})
