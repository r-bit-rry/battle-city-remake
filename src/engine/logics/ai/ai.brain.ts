import {
	AiBonusSnapshot,
	AiGoal,
	AiMemory,
	AiRoleProfile,
	AiSnapshot,
	AiTierFeatures,
	Threat,
} from './ai.types'
import { FLAG_X, FLAG_Y, GUARD_Y } from './ai.perception'
import { retreatLives } from './ai.profiles'
import { flagWall } from './ai.terrain'

const distance = (x1: number, y1: number, x2: number, y2: number) =>
	Math.hypot(x1 - x2, y1 - y2)

const BASE_DEFENSE_LINE_MULTIPLIER = 1.4
const BASE_ALERT_RADIUS_MULTIPLIER = 1.5
const BASE_ALERT_AI_DISTANCE = 120
const BASE_ALERT_SCORE = 1

const enemyById = (snapshot: AiSnapshot, id: string) =>
	snapshot.enemies.find((enemy) => enemy.id === id)

// A rush on the flag overrides the normal goal weights while the AI is away:
// one or more enemies inside the alert ring mean "come home". The ring is
// wide (baseDangerRadius * 1.5), so camping while home starved the AI of
// kills; the guard duty itself is defendGoal's job once it is back.
export const baseAlertEnemy = (
	snapshot: AiSnapshot,
	features: AiTierFeatures
): AiSnapshot['enemies'][number] | null => {
	if (
		distance(snapshot.ai.x, snapshot.ai.y, FLAG_X, FLAG_Y) <=
		BASE_ALERT_AI_DISTANCE
	)
		return null

	const radius = features.baseDangerRadius * BASE_ALERT_RADIUS_MULTIPLIER
	let nearest: AiSnapshot['enemies'][number] | null = null
	let nearestDistance = Infinity
	for (const enemy of snapshot.enemies) {
		const distToBase = distance(enemy.x, enemy.y, FLAG_X, FLAG_Y)
		if (distToBase > radius || distToBase >= nearestDistance) continue
		nearestDistance = distToBase
		nearest = enemy
	}

	return nearest
}

const alertDefendGoal = (
	snapshot: AiSnapshot,
	features: AiTierFeatures
): { goal: AiGoal; score: number; alert: true } | null => {
	const enemy = baseAlertEnemy(snapshot, features)
	if (!enemy) return null

	return {
		goal: { kind: 'defend', x: FLAG_X, y: GUARD_Y, enemyId: enemy.id },
		score: BASE_ALERT_SCORE,
		alert: true,
	}
}

export const isGoalValid = (goal: AiGoal, snapshot: AiSnapshot) => {
	if (goal.enemyId && !snapshot.enemies.some((e) => e.id === goal.enemyId))
		return false
	if (goal.bonusId && !snapshot.bonuses.some((b) => b.id === goal.bonusId))
		return false

	return true
}

export const bonusValue = (
	snapshot: AiSnapshot,
	bonus: AiBonusSnapshot,
	features: AiTierFeatures,
	threats: Threat[]
): number => {
	if (features.bonusLogic === 'none') return 0
	if (features.bonusLogic === 'safe') return 1

	switch (bonus.type) {
		case 'STAR':
			return snapshot.ai.type === 'LVL_0'
				? 1
				: snapshot.ai.type === 'LVL_1'
					? 0.8
					: 0.4
		case 'HP':
			return snapshot.ai.lives < 3 ? 1 : 0.2
		case 'GRENADE':
			return snapshot.enemies.length >= 2 ? 1 : 0.3
		case 'HELMET': {
			const nearBase = threats.some((threat) => {
				const enemy = enemyById(snapshot, threat.enemyId)
				return (
					enemy &&
					distance(enemy.x, enemy.y, FLAG_X, FLAG_Y) <=
						features.baseDangerRadius
				)
			})
			return nearBase ? 0.9 : 0.5
		}
		case 'TIMER':
			return snapshot.enemies.length >= 2 ? 0.9 : 0.4
	}
}

const defendGoal = (
	snapshot: AiSnapshot,
	threats: Threat[],
	features: AiTierFeatures
): { goal: AiGoal; score: number } | null => {
	// An open flag wall is a base alert while the AI is away: nothing outbids
	// coming home, because the next enemy bullet through the hole ends the
	// game. Once it is home, standing guard is defendGoal's normal job.
	const breached =
		flagWall(snapshot).breached &&
		baseAlertEnemy(snapshot, features) !== null

	for (const threat of threats) {
		const enemy = enemyById(snapshot, threat.enemyId)
		if (!enemy) continue
		const distToBase = distance(enemy.x, enemy.y, FLAG_X, FLAG_Y)
		const nearBase =
			distToBase <= features.baseDangerRadius ||
			(threat.hasLineToBase &&
				distToBase <=
					features.baseDangerRadius * BASE_DEFENSE_LINE_MULTIPLIER)
		if (!nearBase) continue

		let target = { x: enemy.x, y: enemy.y }
		if (
			features.intercept &&
			enemy.direction === 'BOTTOM' &&
			enemy.y > GUARD_Y
		)
			target = { x: enemy.x, y: Math.max(GUARD_Y, enemy.y - 32) }

		return {
			goal: {
				kind: 'defend',
				x: target.x,
				y: target.y,
				enemyId: enemy.id,
			},
			score: breached ? BASE_ALERT_SCORE : threat.score,
		}
	}

	return null
}

const engageGoal = (
	snapshot: AiSnapshot,
	features: AiTierFeatures
): { goal: AiGoal; score: number } | null => {
	const candidates = snapshot.enemies
		.filter(
			(enemy) =>
				distance(enemy.x, enemy.y, snapshot.ai.x, snapshot.ai.y) <=
				features.leashRange
		)
		.map((enemy) => {
			const playerNear =
				!snapshot.player.dead &&
				distance(
					enemy.x,
					enemy.y,
					snapshot.player.x,
					snapshot.player.y
				) < 24
			const score =
				0.6 *
					(1 -
						Math.min(
							1,
							distance(
								enemy.x,
								enemy.y,
								snapshot.ai.x,
								snapshot.ai.y
							) / 200
						)) +
				0.25 * (1 - enemy.lives / 3) +
				0.15 * (enemy.carrier ? 1 : 0) -
				(playerNear ? 0.1 : 0)

			return { enemy, score }
		})
		.sort((a, b) => b.score - a.score)

	const best = candidates[0]
	if (!best) return null

	return {
		goal: {
			kind: 'engage',
			x: best.enemy.x,
			y: best.enemy.y,
			enemyId: best.enemy.id,
		},
		score: Math.max(0, best.score),
	}
}

const CONTESTED_BONUS_SHARE = 0.3
const CONTESTED_BONUS_MARGIN = 12

const nearestEnemyDistance = (snapshot: AiSnapshot, bonus: AiBonusSnapshot) => {
	let nearest = Infinity
	for (const enemy of snapshot.enemies) {
		const dist = distance(enemy.x, enemy.y, bonus.x, bonus.y)
		if (dist < nearest) nearest = dist
	}

	return nearest
}

export const collectGoal = (
	snapshot: AiSnapshot,
	features: AiTierFeatures,
	threats: Threat[]
): { goal: AiGoal; score: number } | null => {
	if (features.bonusLogic === 'none') return null

	const valued = snapshot.bonuses
		.map((bonus) => {
			let value = bonusValue(snapshot, bonus, features, threats)
			const aiDistance = distance(
				snapshot.ai.x,
				snapshot.ai.y,
				bonus.x,
				bonus.y
			)
			// An enemy that is clearly closer keeps the bonus in play at a
			// fraction of its worth instead of dropping it: abandoning every
			// contested pickup also abandoned the ones it could win.
			if (
				nearestEnemyDistance(snapshot, bonus) <=
				aiDistance - CONTESTED_BONUS_MARGIN
			)
				value *= CONTESTED_BONUS_SHARE

			if (
				features.yieldBonuses &&
				!snapshot.player.dead &&
				distance(
					snapshot.player.x,
					snapshot.player.y,
					bonus.x,
					bonus.y
				) < aiDistance
			)
				value = 0

			return {
				bonus,
				value,
				score: value * (1 - Math.min(1, aiDistance / 300)),
			}
		})
		.filter((candidate) => candidate.value > 0)
		.sort((a, b) => b.score - a.score)

	const best = valued[0]
	if (!best) return null

	return {
		goal: {
			kind: 'collect',
			x: best.bonus.x,
			y: best.bonus.y,
			bonusId: best.bonus.id,
		},
		score: best.score,
	}
}

const supportGoal = (
	snapshot: AiSnapshot,
	features: AiTierFeatures
): { goal: AiGoal; score: number } | null => {
	if (!features.coordination || snapshot.playerIntent === 'dead') return null

	if (snapshot.playerIntent === 'retreating') {
		const pursuer = snapshot.enemies
			.map((enemy) => ({
				enemy,
				distance: distance(
					enemy.x,
					enemy.y,
					snapshot.player.x,
					snapshot.player.y
				),
			}))
			.sort((a, b) => a.distance - b.distance)[0]?.enemy
		const goal: AiGoal = pursuer
			? {
					kind: 'support',
					x: (snapshot.player.x + pursuer.x) / 2,
					y: (snapshot.player.y + pursuer.y) / 2,
				}
			: { kind: 'support', x: snapshot.player.x, y: snapshot.player.y }

		return { goal, score: 0.9 }
	}

	if (snapshot.playerIntent === 'pushing') {
		return {
			goal: {
				kind: 'support',
				x: Math.min(166, Math.max(40, snapshot.player.x)),
				y: GUARD_Y + 24,
			},
			score: 0.55,
		}
	}

	return {
		goal: {
			kind: 'support',
			x: snapshot.player.x < FLAG_X ? 160 : 46,
			y: 110,
		},
		score: 0.4,
	}
}

const retreatGoal = (
	snapshot: AiSnapshot,
	features: AiTierFeatures,
	role: AiRoleProfile
): { goal: AiGoal; score: number } | null => {
	const nearby = snapshot.enemies.filter(
		(enemy) =>
			distance(enemy.x, enemy.y, snapshot.ai.x, snapshot.ai.y) <= 80
	)
	if (snapshot.ai.lives > retreatLives(features, role)) return null
	if (nearby.length < 2) return null

	return {
		goal: { kind: 'retreat', x: FLAG_X, y: GUARD_Y },
		score: 0.85,
	}
}

const patrolGoal = (
	snapshot: AiSnapshot,
	role: AiRoleProfile
): { goal: AiGoal; score: number } | null => {
	const anchor =
		role.patrolAnchor === 'base' || snapshot.player.dead
			? { x: FLAG_X, y: GUARD_Y }
			: role.patrolAnchor === 'middle'
				? { x: FLAG_X, y: 110 }
				: { x: snapshot.player.x, y: snapshot.player.y }
	const dist = distance(snapshot.ai.x, snapshot.ai.y, anchor.x, anchor.y)
	if (dist <= 28) return null

	return { goal: { kind: 'patrol', x: anchor.x, y: anchor.y }, score: 0.3 }
}

export const selectGoal = (
	snapshot: AiSnapshot,
	threats: Threat[],
	features: AiTierFeatures,
	role: AiRoleProfile,
	memory: AiMemory
): AiGoal | null => {
	const candidates = [
		alertDefendGoal(snapshot, features),
		defendGoal(snapshot, threats, features),
		engageGoal(snapshot, features),
		collectGoal(snapshot, features, threats),
		supportGoal(snapshot, features),
		retreatGoal(snapshot, features, role),
		patrolGoal(snapshot, role),
	].filter(
		(
			candidate
		): candidate is { goal: AiGoal; score: number; alert?: true } =>
			Boolean(candidate)
	)

	const alert = candidates.find((candidate) => candidate.alert)
	if (alert) {
		// score 0: never let goal memory outlive the alert
		memory.goalScore = 0
		if (alert.goal.enemyId) memory.lastTargetId = alert.goal.enemyId

		return alert.goal
	}

	const best = candidates
		.map((candidate) => ({
			goal: candidate.goal,
			weighted: candidate.score * role.weights[candidate.goal.kind],
		}))
		.sort((a, b) => b.weighted - a.weighted)[0]

	if (!best) return null

	const current = memory.goal
	if (
		current &&
		isGoalValid(current, snapshot) &&
		best.weighted <= memory.goalScore * 1.15
	) {
		const currentMatch = candidates.find(
			(candidate) =>
				candidate.goal.kind === current.kind &&
				candidate.goal.enemyId === current.enemyId &&
				candidate.goal.bonusId === current.bonusId
		)
		if (currentMatch && !current.enemyId && !current.bonusId) {
			memory.goal = currentMatch.goal
			return currentMatch.goal
		}
		return current
	}

	memory.goalScore = best.weighted
	if (best.goal.enemyId) memory.lastTargetId = best.goal.enemyId

	return best.goal
}
