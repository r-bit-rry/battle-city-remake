// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bullet, GameObject } from '../../instances'
import { AI_ROLE_PROFILES, AI_TIER_FEATURES } from './ai.profiles'
import { buildSnapshot, createMemory } from './ai.perception'
import { buildDangerMap } from './ai.threat'
import { decideTactics, stepPosition } from './ai.tactics'
import { makeAiGame, makeEnemy } from './ai.test-utils'

afterEach(() => vi.restoreAllMocks())

const decide = (
	game: ReturnType<typeof makeAiGame>,
	goal: Parameters<typeof decideTactics>[3] = null,
	path: Parameters<typeof decideTactics>[4] = null
) => {
	const memory = createMemory()
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
})
