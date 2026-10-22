// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameObject } from '../../instances'
import { isEnemy } from '../../utils'
import { gameFrame } from '../index'
import { aiFrameLogic, getAiMemory } from '../ai.logic'
import { aiSettings, makeAiGame, makeBonus, makeEnemy } from './ai.test-utils'

const brickColumn = (tileX: number, fromTileY: number, toTileY: number) =>
	Array.from(
		{ length: toTileY - fromTileY + 1 },
		(_, i) => new GameObject('BRICK', tileX, fromTileY + i)
	)

const seedRandom = (seedValue: number) => {
	let seed = seedValue
	vi.spyOn(Math, 'random').mockImplementation(() => {
		seed |= 0
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	})
}

afterEach(() => vi.restoreAllMocks())

describe('AI ally scenarios', () => {
	it('defends the base when an enemy rushes it', () => {
		seedRandom(7)
		const game = makeAiGame('pro')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 100
		game.enemies = [makeEnemy(103, 40)]
		game.objects = []

		for (let i = 0; i < 10; i++) gameFrame(game)

		expect(getAiMemory(game)?.goal?.kind).toBe('defend')
		expect(getAiMemory(game)?.goal?.enemyId).toBe(game.enemies[0].id)
	})

	it('drills a brick wall that seals the route to a target', () => {
		seedRandom(11)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 150
		game.p1.coordinateY = 150
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.enemies = [makeEnemy(120, 40)]
		game.objects = brickColumn(8, 0, 24)
		const bricksBefore = game.objects.length

		for (let i = 0; i < 120; i++) gameFrame(game)

		expect(game.objects.length).toBeLessThan(bricksBefore)
	})

	it('covers the base while the player pushes', () => {
		seedRandom(21)
		const game = makeAiGame('pro', 'wingman')
		game.levelChangeAnimation = 0
		game.p2!.coordinateX = 136
		game.p2!.coordinateY = 60
		game.enemies = [makeEnemy(200, 160)]

		for (let i = 0; i < 200; i++) {
			game.p1Controls.move = 'TOP'
			gameFrame(game)
		}

		const memory = getAiMemory(game)
		expect(['support', 'defend', 'patrol']).toContain(memory?.goal?.kind)
		expect(game.p2!.coordinateY).toBeLessThan(120)
	})

	it('guards the base when the player is out of lives', () => {
		seedRandom(3)
		const game = makeAiGame('pro')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 150
		game.p1.lives = 0
		game.enemies = [makeEnemy(200, 200)]
		const distanceToBase = () =>
			Math.hypot(game.p2!.coordinateX - 103, game.p2!.coordinateY - 31)
		const startDistance = distanceToBase()

		for (let i = 0; i < 60; i++) gameFrame(game)

		const memory = getAiMemory(game)
		expect(memory?.goal?.kind).toBe('patrol')
		expect(memory?.goal?.x).toBe(103)
		expect(memory?.goal?.y).toBe(31)
		expect(distanceToBase()).toBeLessThan(startDistance)
		expect(game.p2!.coordinateY).toBeLessThan(140)
	})

	it('kills an isolated enemy in a 1v1 duel', () => {
		seedRandom(42)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 60
		game.p2!.coordinateY = 40
		game.enemies = [makeEnemy(120, 40)]
		game.objects = []
		const enemyId = game.enemies[0].id

		for (let i = 0; i < 600; i++) gameFrame(game)

		expect(game.enemies.some((enemy) => enemy.id === enemyId)).toBe(false)
	})

	it('regroups when hurt and outnumbered as the guardian', () => {
		seedRandom(9)
		const game = makeAiGame('pro', 'guardian')
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p2!.lives = 2
		game.enemies = [makeEnemy(40, 140), makeEnemy(60, 160)]

		aiFrameLogic(game)

		expect(getAiMemory(game)?.goal?.kind).toBe('retreat')
	})

	it('never fires down a clear lane through the other player', () => {
		seedRandom(5)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.p1.coordinateX = 103
		game.p1.coordinateY = 112
		game.enemies = [makeEnemy(103, 232)]
		game.objects = []

		for (let i = 0; i < 3; i++) gameFrame(game)

		expect(
			game.bullets.filter((bullet) => !isEnemy(bullet.shooter))
		).toHaveLength(0)
	})

	it('never fires through the other player 8 px off the lane', () => {
		// the engine's bullets collide at ±8 px (isBulletHitTank), so a gate
		// that only covers ±7 lets this shot through
		seedRandom(5)
		const game = makeAiGame('elite', 'wingman', {
			...aiSettings,
			friendlyFire: true,
		})
		game.levelChangeAnimation = 0
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.p1.coordinateX = 111
		game.p1.coordinateY = 140
		game.enemies = [makeEnemy(103, 220)]
		game.objects = []
		const lives = game.p1.lives

		for (let i = 0; i < 20; i++) gameFrame(game)

		expect(game.p1.lives).toBe(lives)
		expect(
			game.bullets.filter((bullet) => !isEnemy(bullet.shooter))
		).toHaveLength(0)

		// positive control: the same setup without p1 in the way fires
		const control = makeAiGame('elite', 'wingman', {
			...aiSettings,
			friendlyFire: true,
		})
		control.levelChangeAnimation = 0
		control.p2!.coordinateX = 103
		control.p2!.coordinateY = 100
		control.p2!.direction = 'TOP'
		control.p1.coordinateX = 40
		control.p1.coordinateY = 200
		control.enemies = [makeEnemy(103, 220)]
		control.objects = []
		for (let i = 0; i < 3; i++) gameFrame(control)

		expect(control.bullets.some((bullet) => !isEnemy(bullet.shooter))).toBe(
			true
		)
	})

	it('fires down a clear lane instead of holding a stale commitment', () => {
		seedRandom(13)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 200
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 100
		game.p2!.direction = 'LEFT'
		game.objects = []
		game.enemies = [makeEnemy(200, 180)]

		// two frames of driving: the heading commitment is now live
		for (let i = 0; i < 2; i++) gameFrame(game)
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 100
		game.enemies = [makeEnemy(103, 220)]

		let ticks = 0
		let fired = false
		while (ticks < 8 && !fired) {
			gameFrame(game)
			ticks++
			fired = game.bullets.some((bullet) => !isEnemy(bullet.shooter))
		}

		expect(fired, `first shot after ${ticks} ticks`).toBe(true)
	})

	it('snipes an aligned enemy 120 px away, beyond engage range', () => {
		seedRandom(13)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.enemies = [makeEnemy(103, 220)]
		game.objects = []

		for (let i = 0; i < 3; i++) gameFrame(game)

		expect(game.bullets.some((bullet) => !isEnemy(bullet.shooter))).toBe(
			true
		)
	})

	it('drills the brick that opens the lane to a walled enemy', () => {
		seedRandom(17)
		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 200
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.enemies = [makeEnemy(88, 40)]
		game.objects = [
			new GameObject('BRICK', 8, 5),
			new GameObject('BRICK', 8, 6),
			new GameObject('BRICK', 8, 7),
			new GameObject('STONE', 11, 6),
		]
		// pinned against the stone above it: a walled enemy, not a wandering one
		const enemy = game.enemies[0]
		enemy.nextMoves = { direction: 'TOP', repeat: 9999 }
		enemy.availableBullets = 0
		// keep a spare enemy queued so the level does not restart on the kill
		game.enemyList = [{ type: 'NORMAL' }]
		const enemyId = enemy.id
		const laneBrick = game.objects[0]

		for (let i = 0; i < 200; i++) gameFrame(game)

		expect(game.objects).not.toContain(laneBrick)
		expect(game.enemies.some((other) => other.id === enemyId)).toBe(false)
	})

	it('does not abandon a defend goal for a bonus an enemy is closer to', () => {
		seedRandom(23)
		const game = makeAiGame('intermediate', 'hunter')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 200
		game.p1.coordinateY = 200
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 120
		game.enemies = [makeEnemy(103, 0)]
		game.bonuses = [makeBonus(103, 50)]
		game.objects = []

		aiFrameLogic(game)

		// bonus 70 px away, enemy 20 px closer to it: contested, so it only
		// keeps a 0.3 share and the defend goal stays
		expect(getAiMemory(game)?.goal?.kind).toBe('defend')
	})

	it('rallies to the flag for every tier and role when two enemies reach it', () => {
		const tiers = ['beginner', 'intermediate', 'pro', 'elite'] as const
		const roles = ['guardian', 'wingman', 'hunter'] as const

		for (const tier of tiers) {
			for (const role of roles) {
				const game = makeAiGame(tier, role)
				game.levelChangeAnimation = 0
				game.p1.coordinateX = 40
				game.p1.coordinateY = 150
				game.p2!.coordinateX = 160
				game.p2!.coordinateY = 120
				game.enemies = [makeEnemy(103, 40), makeEnemy(120, 40)]
				game.objects = []

				aiFrameLogic(game)

				const goal = getAiMemory(game)?.goal
				expect(goal?.kind, `${tier}:${role}`).toBe('defend')
				expect(goal?.x, `${tier}:${role}`).toBe(103)
				expect(goal?.y, `${tier}:${role}`).toBe(31)
			}
		}
	})
})
