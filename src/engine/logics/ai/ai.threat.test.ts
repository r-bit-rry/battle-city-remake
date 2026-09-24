// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Bullet, GameObject } from '../../instances'
import { buildSnapshot, createMemory } from './ai.perception'
import {
	buildDangerMap,
	computeThreats,
	findIncomingBullet,
	isCellDangerous,
	predictedHit,
} from './ai.threat'
import { makeAiGame, makeEnemy } from './ai.test-utils'

const snapshotOf = (game: ReturnType<typeof makeAiGame>) =>
	buildSnapshot(game, createMemory())

describe('computeThreats', () => {
	it('ranks a base-rushing speedy carrier above a distant normal tank', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.enemies = [
			makeEnemy(103, 40, 'SPEEDY', 'STAR'),
			makeEnemy(40, 200, 'NORMAL'),
		]

		const threats = computeThreats(snapshotOf(game))

		expect(threats[0].enemyId).toBe(game.enemies[0].id)
		expect(threats[0].score).toBeGreaterThan(threats[1].score)
	})

	it('detects an enemy aiming at the player', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		const aiming = makeEnemy(100, 140)
		aiming.direction = 'BOTTOM'
		game.enemies = [aiming]

		const threats = computeThreats(snapshotOf(game))

		expect(threats[0].aimingPlayer).toBe(true)
	})

	it('loses line to base behind a stone wall', () => {
		const game = makeAiGame()
		game.enemies = [makeEnemy(103, 120)]
		const clear = computeThreats(snapshotOf(game))[0].hasLineToBase
		game.objects = [
			new GameObject('STONE', 12, 8),
			new GameObject('STONE', 13, 8),
		]

		expect(clear).toBe(true)
		expect(computeThreats(snapshotOf(game))[0].hasLineToBase).toBe(false)
	})
})

describe('danger map and incoming bullets', () => {
	it('predicts a bullet impact with the AI', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.bullets = [new Bullet(80, 100, 'RIGHT', 'NORMAL', 'enemy-1')]

		const snapshot = snapshotOf(game)
		const incoming = findIncomingBullet(snapshot, 30)

		expect(incoming).not.toBeNull()
		expect(
			predictedHit(incoming!, snapshot, snapshot.ai.x, snapshot.ai.y, 30)
		).toBe(true)
	})

	it('marks the bullet lane dangerous and decays with distance', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.bullets = [new Bullet(80, 100, 'RIGHT', 'NORMAL', 'enemy-1')]

		const danger = buildDangerMap(snapshotOf(game), 30)

		expect(isCellDangerous(danger, 100, 100, 30)).toBe(true)
		expect(isCellDangerous(danger, 40, 40, 30)).toBe(false)
	})

	it('stops the ray at a bullet-blocking obstacle', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.bullets = [new Bullet(80, 100, 'RIGHT', 'NORMAL', 'enemy-1')]
		game.objects = [new GameObject('STONE', 12, 12)]

		const danger = buildDangerMap(snapshotOf(game), 30)

		expect(isCellDangerous(danger, 100, 100, 30)).toBe(false)
	})
})
