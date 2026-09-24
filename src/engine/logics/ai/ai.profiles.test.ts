// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { AI_ROLE_PROFILES, AI_TIER_FEATURES, retreatLives } from './ai.profiles'

describe('AI tier features', () => {
	it('defines a profile for every tier', () => {
		expect(Object.keys(AI_TIER_FEATURES).sort()).toEqual([
			'beginner',
			'elite',
			'intermediate',
			'pro',
		])
	})

	it('scales reaction and accuracy monotonically with tier', () => {
		const order = ['beginner', 'intermediate', 'pro', 'elite'] as const
		for (let i = 1; i < order.length; i++) {
			const lower = AI_TIER_FEATURES[order[i - 1]]
			const higher = AI_TIER_FEATURES[order[i]]
			expect(higher.decisionInterval).toBeLessThanOrEqual(
				lower.decisionInterval
			)
			expect(higher.fireCooldown).toBeLessThanOrEqual(lower.fireCooldown)
			expect(higher.aimTolerance).toBeGreaterThanOrEqual(
				lower.aimTolerance
			)
			expect(higher.aimJitter).toBeLessThanOrEqual(lower.aimJitter)
		}
	})

	it('unlocks capabilities only at the right tiers', () => {
		expect(AI_TIER_FEATURES.beginner.pathfinding).toBe('greedy')
		expect(AI_TIER_FEATURES.intermediate.pathfinding).toBe('bfs')
		expect(AI_TIER_FEATURES.pro.dodgeHorizon).toBeGreaterThan(0)
		expect(AI_TIER_FEATURES.intermediate.brickDrilling).toBe(false)
		expect(AI_TIER_FEATURES.pro.brickDrilling).toBe(true)
		expect(AI_TIER_FEATURES.pro.coordination).toBe(true)
		expect(AI_TIER_FEATURES.elite.blockBullets).toBe(true)
		expect(AI_TIER_FEATURES.elite.yieldBonuses).toBe(true)
		expect(AI_TIER_FEATURES.intermediate.yieldBonuses).toBe(false)
	})
})

describe('AI roles', () => {
	it('defines all six goal weights for every role', () => {
		for (const role of Object.values(AI_ROLE_PROFILES)) {
			expect(Object.keys(role.weights).sort()).toEqual([
				'collect',
				'defend',
				'engage',
				'patrol',
				'retreat',
				'support',
			])
		}
	})

	it('makes guardian more defensive and hunter more aggressive', () => {
		expect(AI_ROLE_PROFILES.guardian.weights.defend).toBeGreaterThan(
			AI_ROLE_PROFILES.hunter.weights.defend
		)
		expect(AI_ROLE_PROFILES.hunter.weights.engage).toBeGreaterThan(
			AI_ROLE_PROFILES.guardian.weights.engage
		)
	})

	it('composes retreat lives from tier and role', () => {
		const pro = AI_TIER_FEATURES.pro
		expect(retreatLives(pro, AI_ROLE_PROFILES.guardian)).toBe(2)
		expect(retreatLives(pro, AI_ROLE_PROFILES.wingman)).toBe(1)
		expect(retreatLives(pro, AI_ROLE_PROFILES.hunter)).toBe(1)
	})
})
