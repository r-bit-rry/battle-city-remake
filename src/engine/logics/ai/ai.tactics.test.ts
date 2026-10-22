// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bullet, GameObject } from '../../instances'
import { gameFrame } from '../index'
import { AI_ROLE_PROFILES, AI_TIER_FEATURES } from './ai.profiles'
import { buildSnapshot, createMemory } from './ai.perception'
import { buildDangerMap } from './ai.threat'
import { decideTactics, directionToWaypoint, stepPosition } from './ai.tactics'
import { makeAiGame, makeEnemy } from './ai.test-utils'

afterEach(() => vi.restoreAllMocks())

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

const decide = (
	game: ReturnType<typeof makeAiGame>,
	goal: Parameters<typeof decideTactics>[3] = null,
	path: Parameters<typeof decideTactics>[4] = null,
	memory: ReturnType<typeof createMemory> = createMemory()
) => {
	const snapshot = buildSnapshot(game, memory)
	const danger = buildDangerMap(snapshot, 45)
	const busy = [...game.enemies, ...game.objects, game.p1]

	return decideTactics(
		snapshot,
		AI_TIER_FEATURES.pro,
		AI_ROLE_PROFILES.wingman,
		goal,
		path,
		danger,
		memory,
		busy
	)
}

describe('stepPosition', () => {
	it('maps directions to the engine axis semantics', () => {
		expect(stepPosition(100, 100, 'TOP')).toEqual({ x: 100, y: 101 })
		expect(stepPosition(100, 100, 'BOTTOM')).toEqual({ x: 100, y: 99 })
		expect(stepPosition(100, 100, 'LEFT')).toEqual({ x: 99, y: 100 })
		expect(stepPosition(100, 100, 'RIGHT')).toEqual({ x: 101, y: 100 })
	})
})

describe('directionToWaypoint', () => {
	it('ignores a lane offset the 15 px tank box already covers', () => {
		// x 3 px off the lane is inside the box: the tank drives the long axis
		// instead of turning 1 px back and forth to "fix" it.
		expect(directionToWaypoint({ x: 100, y: 100 }, { x: 103, y: 95 })).toBe(
			'BOTTOM'
		)
		expect(
			directionToWaypoint({ x: 100, y: 100 }, { x: 102, y: 106 })
		).toBe('TOP')
		// outside the deadband the lane wins
		expect(directionToWaypoint({ x: 100, y: 100 }, { x: 105, y: 95 })).toBe(
			'RIGHT'
		)
		expect(directionToWaypoint({ x: 100, y: 100 }, { x: 98, y: 94 })).toBe(
			'BOTTOM'
		)
		expect(
			directionToWaypoint({ x: 100, y: 100 }, { x: 102, y: 104 })
		).toBeNull()
	})
})

describe('decideTactics', () => {
	it('dodges an incoming bullet perpendicular to its axis', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'RIGHT'
		game.bullets = [new Bullet(72, 100, 'RIGHT', 'NORMAL', 'enemy-1')]

		const decision = decide(game)

		expect(['TOP', 'BOTTOM']).toContain(decision.move)
		expect(decision.fire).toBe(false)
	})

	it('fires at an aligned enemy inside engage range', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.enemies = [makeEnemy(100, 140)]
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game, {
			kind: 'engage',
			x: 100,
			y: 140,
			enemyId: game.enemies[0].id,
		})

		expect(decision.fire).toBe(true)
		random.mockRestore()
	})

	it('never fires through the human player', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.p1.coordinateX = 100
		game.p1.coordinateY = 120
		game.enemies = [makeEnemy(100, 150)]
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game, {
			kind: 'engage',
			x: 100,
			y: 150,
			enemyId: game.enemies[0].id,
		})

		expect(decision.fire).toBe(false)
		random.mockRestore()
	})

	it('never fires through a brick wall', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.enemies = [makeEnemy(100, 150)]
		game.objects = [new GameObject('BRICK', 12, 16)]
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game, {
			kind: 'engage',
			x: 100,
			y: 150,
			enemyId: game.enemies[0].id,
		})

		expect(decision.fire).toBe(false)
		random.mockRestore()
	})

	it('holds position when the goal is reached', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100

		const decision = decide(game, { kind: 'patrol', x: 103, y: 103 })

		expect(decision).toEqual({ move: null, fire: false })
	})

	it('follows path waypoints', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40

		const decision = decide(
			game,
			{ kind: 'patrol', x: 120, y: 40 },
			{
				waypoints: [{ x: 48, y: 40 }],
				brick: null,
			}
		)

		expect(decision.move).toBe('RIGHT')
	})

	it('fires at a brick the path needs opened', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p2!.direction = 'RIGHT'
		game.objects = [new GameObject('BRICK', 6, 5)]

		const decision = decide(
			game,
			{ kind: 'engage', x: 120, y: 40 },
			{ waypoints: [{ x: 48, y: 40 }], brick: { x: 48, y: 40 } }
		)

		expect(decision.fire).toBe(true)
		expect(decision.move).toBeNull()
	})

	it('gates escape-brick fire on the fire cooldown', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 40
		game.p2!.direction = 'TOP'
		game.bullets = [new Bullet(44, 80, 'BOTTOM', 'NORMAL', 'enemy-1')]
		game.objects = [
			new GameObject('BRICK', 4, 5),
			new GameObject('BRICK', 6, 5),
		]

		const ready = decide(game)
		const cooling = decide(game, null, null, {
			...createMemory(),
			fireCooldown: 5,
		})

		expect(ready).toEqual({ move: null, fire: true })
		expect(cooling.fire).toBe(false)
	})
})

describe('combat firing', () => {
	const withEnemy = (
		x: number,
		y: number,
		type: 'NORMAL' | 'SPEEDY' = 'NORMAL'
	) => {
		const game = makeAiGame()
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.p2!.direction = 'TOP'
		game.enemies = [makeEnemy(x, y, type)]

		return game
	}

	it('fires at an enemy one lane over', () => {
		const game = withEnemy(108, 140)
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game)

		expect(decision.fire).toBe(true)
		random.mockRestore()
	})

	it('fires while the goal is positional', () => {
		const game = withEnemy(100, 140)
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game, { kind: 'patrol', x: 200, y: 200 })

		expect(decision.fire).toBe(true)
		random.mockRestore()
	})

	it('does not let the lead point block a fireable line', () => {
		const game = withEnemy(100, 140, 'SPEEDY')
		game.enemies[0].direction = 'RIGHT'
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game)

		expect(decision.fire).toBe(true)
		random.mockRestore()
	})

	it('aligns toward the enemy when diagonal and in range', () => {
		const game = withEnemy(60, 64)
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game)

		expect(decision.move).toBe('LEFT')
		expect(decision.fire).toBe(false)
		random.mockRestore()
	})

	it('fires at a point-blank enemy', () => {
		const game = withEnemy(104, 104)
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game)

		expect(decision.fire).toBe(true)
		random.mockRestore()
	})

	it('fires at a mid-range aligned enemy', () => {
		const game = withEnemy(100, 160)
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(game)

		expect(decision.fire).toBe(true)
		random.mockRestore()
	})

	it('keeps moving while the fire cooldown runs', () => {
		const game = withEnemy(100, 140)
		const memory = { ...createMemory(), fireCooldown: 5 }
		const random = vi.spyOn(Math, 'random').mockReturnValue(0)

		const decision = decide(
			game,
			{ kind: 'patrol', x: 200, y: 200 },
			null,
			memory
		)

		expect(decision.move).not.toBeNull()
		expect(decision.fire).toBe(false)
		random.mockRestore()
	})
})

describe('heading commitment', () => {
	it('holds a committed heading for at least eight ticks on a long leg', () => {
		const game = makeAiGame('pro')
		game.p2!.coordinateX = 40
		game.p2!.coordinateY = 100
		game.p2!.direction = 'RIGHT'
		const memory = createMemory()

		for (let i = 0; i < 8; i++) {
			const decision = decide(
				game,
				{ kind: 'patrol', x: 160, y: 100 },
				null,
				memory
			)

			expect(decision.move).toBe('RIGHT')
			expect(memory.commitDir).toBe('RIGHT')
		}
	})

	it('turns once and leaves a pocket instead of spinning in place', () => {
		seedRandom(17)
		const game = makeAiGame('pro')
		game.levelChangeAnimation = 0
		game.p1.coordinateX = 40
		game.p1.coordinateY = 40
		game.p2!.coordinateX = 103
		game.p2!.coordinateY = 100
		// bricks left, right and above: the only way out is down
		game.objects = [
			new GameObject('BRICK', 11, 12),
			new GameObject('BRICK', 14, 12),
			new GameObject('BRICK', 12, 14),
		]
		game.enemies = [makeEnemy(160, 24)]
		const startX = game.p2!.coordinateX
		const startY = game.p2!.coordinateY
		let changes = 0
		let last = game.p2!.direction

		for (let i = 0; i < 60; i++) {
			gameFrame(game)
			if (game.p2!.direction !== last) {
				changes++
				last = game.p2!.direction
			}
		}

		expect(changes).toBeLessThan(4)
		expect(
			Math.max(
				Math.abs(game.p2!.coordinateX - startX),
				Math.abs(game.p2!.coordinateY - startY)
			)
		).toBeGreaterThanOrEqual(8)
	})
})
