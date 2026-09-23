// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Bonus, Bullet, Game, GameObject, Tank } from '../instances'
import { TypeAiLevel, TypeEnemyTank } from '../types'
import {
	AI_PROFILES,
	aiFrameLogic,
	findLanePath,
	selectAiTarget,
} from './ai.logic'
import { playersFrameLogic } from './players.logic'

const settings = {
	hardcore: false,
	playerLevel: 0 as const,
	friendlyFire: false,
	survivorRespawn: false,
	soundPack: 'default' as const,
}

const makeGame = (level: TypeAiLevel = 'pro') => {
	const game = new Game('local', 'p1', 'p2', settings, undefined, level)

	game.p1.spawnAnimation = 0
	game.p1.helmet = 0
	if (game.p2) {
		game.p2.spawnAnimation = 0
		game.p2.helmet = 0
	}

	return game
}

const makeEnemy = (x: number, y: number, type: TypeEnemyTank = 'NORMAL') => {
	const enemy = new Tank('middle', type)
	enemy.coordinateX = x
	enemy.coordinateY = y
	enemy.spawnAnimation = 0

	return enemy
}

const brick = (x: number, y: number) => ({
	id: `brick-${x}-${y}`,
	type: 'BRICK' as const,
	coordinateX: x,
	coordinateY: y,
})

const wallColumn = (x: number, fromY: number, toY: number) =>
	Array.from({ length: (toY - fromY) / 8 + 1 }, (_, i) =>
		brick(x, fromY + i * 8)
	)

describe('findLanePath', () => {
	it('finds a straight path along a lane', () => {
		const tank = makeEnemy(40, 40)

		const path = findLanePath(tank, 120, 40, [])

		expect(path).not.toBeNull()
		expect(path![path!.length - 1]).toEqual({ x: 120, y: 40 })
		expect(path!.every((waypoint) => waypoint.y === 40)).toBe(true)
	})

	it('detours around a wall', () => {
		const tank = makeEnemy(40, 40)
		const wall = wallColumn(64, 0, 55)

		const path = findLanePath(tank, 96, 40, wall)

		expect(path).not.toBeNull()
		expect(path!.some((waypoint) => waypoint.y !== 40)).toBe(true)
		expect(path![path!.length - 1]).toEqual({ x: 96, y: 40 })
	})

	it('returns null when the target is sealed off', () => {
		const tank = makeEnemy(40, 40)
		const wall = wallColumn(64, 0, 200)

		expect(findLanePath(tank, 96, 40, wall)).toBeNull()
	})

	it('can path into a cell occupied by the ignored target', () => {
		const tank = makeEnemy(40, 40)
		const blocker = {
			id: 'enemy-1',
			type: 'NORMAL' as const,
			coordinateX: 96,
			coordinateY: 40,
		}

		expect(findLanePath(tank, 96, 40, [blocker])).toBeNull()
		expect(findLanePath(tank, 96, 40, [blocker], 'enemy-1')).not.toBeNull()
	})
})

describe('selectAiTarget', () => {
	it('prefers the enemy threatening the base over a nearer one', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		const closeEnemy = makeEnemy(40, 130)
		const baseEnemy = makeEnemy(100, 20)
		game.enemies = [closeEnemy, baseEnemy]

		const target = selectAiTarget(game, game.p2!, AI_PROFILES.pro)

		expect(target?.kind).toBe('defend')
		expect(target?.enemy?.id).toBe(baseEnemy.id)
	})

	it('escorts the human player when there are no enemies', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100

		const target = selectAiTarget(game, game.p2!, AI_PROFILES.pro)

		expect(target?.kind).toBe('escort')
		expect(target?.x).toBe(100)
	})

	it('guards the base when the player is out of lives', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 150
		game.p1.lives = 0

		const target = selectAiTarget(game, game.p2!, AI_PROFILES.pro)

		expect(target?.kind).toBe('guard')
	})

	it('ignores enemies that are still spawning', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		const spawning = makeEnemy(100, 20)
		spawning.spawnAnimation = 50
		game.enemies = [spawning]

		const target = selectAiTarget(game, game.p2!, AI_PROFILES.pro)

		expect(target?.kind).toBe('escort')
	})

	it('skips bonuses that sit next to an enemy', () => {
		const game = makeGame('intermediate')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p1.coordinateX = 100
		game.p1.coordinateY = 100
		const riskyBonus = makeBonus(180, 180)
		game.bonuses = [riskyBonus]
		game.enemies = [makeEnemy(180, 190)]

		const target = selectAiTarget(game, game.p2!, AI_PROFILES.intermediate)

		expect(target?.kind).toBe('escort')
	})

	it('collects a safe bonus', () => {
		const game = makeGame('intermediate')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		const bonus = makeBonus(100, 100)
		game.bonuses = [bonus]

		const target = selectAiTarget(game, game.p2!, AI_PROFILES.intermediate)

		expect(target?.kind).toBe('collect')
		expect(target?.x).toBe(100)
	})
})

describe('aiFrameLogic edge cases', () => {
	it('dodges an incoming enemy bullet', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'RIGHT'
		game.bullets = [new Bullet(80, 100, 'RIGHT', 'NORMAL', 'enemy-1')]

		aiFrameLogic(game)

		expect(['TOP', 'BOTTOM']).toContain(game.p2Controls.move)
	})

	it('never fires when the human player is in the line of fire', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.p1.coordinateX = 100
		game.p1.coordinateY = 120
		game.enemies = [makeEnemy(100, 150)]
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		for (let i = 0; i < 20; i++) {
			aiFrameLogic(game)
			expect(game.p2Controls.fire).toBe(false)
		}

		random.mockRestore()
	})

	it('never fires through a wall', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.enemies = [makeEnemy(100, 150)]
		game.objects = [new GameObject('BRICK', 12, 16)]
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		for (let i = 0; i < 20; i++) {
			aiFrameLogic(game)
			expect(game.p2Controls.fire).toBe(false)
		}

		random.mockRestore()
	})

	it('clears controls when the AI tank has no lives left', () => {
		const game = makeGame('pro')
		game.p2!.lives = 0
		game.p2Controls.move = 'TOP'
		game.p2Controls.fire = true

		aiFrameLogic(game)

		expect(game.p2Controls.move).toBeNull()
		expect(game.p2Controls.fire).toBe(false)
	})

	it('clears controls while the game is paused', () => {
		const game = makeGame('pro')
		game.isPaused = true
		game.p2Controls.move = 'TOP'
		game.p2Controls.fire = true

		aiFrameLogic(game)

		expect(game.p2Controls.move).toBeNull()
		expect(game.p2Controls.fire).toBe(false)
	})

	it('retargets after the engaged enemy despawns', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p2!.direction = 'TOP'
		game.p1.coordinateX = 140
		game.p1.coordinateY = 40
		game.enemies = [makeEnemy(40, 100)]

		aiFrameLogic(game)
		game.enemies = []
		aiFrameLogic(game)
		aiFrameLogic(game)

		expect(game.p2Controls.move).toBe('RIGHT')
	})

	it('routes around a wall instead of pushing into it', () => {
		const game = makeGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p2!.direction = 'TOP'
		game.enemies = [makeEnemy(40, 120)]
		game.objects = [
			new GameObject('BRICK', 4, 6),
			new GameObject('BRICK', 5, 6),
			new GameObject('BRICK', 6, 6),
		]

		const moves: (string | null)[] = []
		for (let i = 0; i < 160; i++) {
			aiFrameLogic(game)
			moves.push(game.p2Controls.move)
			playersFrameLogic(game)
		}

		expect(moves.some((move) => move === 'LEFT' || move === 'RIGHT')).toBe(
			true
		)
		expect(game.p2!.coordinateY).toBeGreaterThan(55)
	})
})

function makeBonus(x: number, y: number) {
	const bonus = new Bonus('STAR')
	bonus.coordinateX = x
	bonus.coordinateY = y

	return bonus
}
