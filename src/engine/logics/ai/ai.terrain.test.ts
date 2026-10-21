// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GameObject } from '../../instances'
import { Map1 } from '../../maps/1'
import { AI_TIER_FEATURES } from './ai.profiles'
import { buildSnapshot, createMemory } from './ai.perception'
import { chooseDrill, drillValue, flagWall } from './ai.terrain'
import { makeAiGame, makeEnemy } from './ai.test-utils'

// The stock map is the only wall that matters, so the wall tests load it.
const stockSnapshot = () => {
	const game = makeAiGame('elite')
	game.levelChangeAnimation = 0
	game.objects = Map1().objects
	game.p1.coordinateX = 40
	game.p1.coordinateY = 200
	game.p2!.coordinateX = 40
	game.p2!.coordinateY = 200
	game.enemies = []

	return buildSnapshot(game, createMemory())
}

const emptySnapshot = (
	objects: GameObject[],
	enemies: ReturnType<typeof makeEnemy>[] = []
) => {
	const game = makeAiGame('elite')
	game.levelChangeAnimation = 0
	game.objects = objects
	game.enemies = enemies
	game.p1.coordinateX = 200
	game.p1.coordinateY = 200
	game.p2!.coordinateX = 40
	game.p2!.coordinateY = 40

	return buildSnapshot(game, createMemory())
}

describe('flagWall', () => {
	it('sees the stock map flag wall intact on all four sides', () => {
		const wall = flagWall(stockSnapshot())

		expect(wall.bricks).toBe(8)
		expect(wall.breached).toBe(false)
	})

	it('reports a breach when the top-side bricks are gone', () => {
		const snapshot = stockSnapshot()
		const topSide = snapshot.obstacles.filter(
			(obstacle) =>
				obstacle.destructible &&
				obstacle.y === 16 &&
				obstacle.x >= 88 &&
				obstacle.x <= 112
		)
		expect(topSide).toHaveLength(4)

		const game = makeAiGame('elite')
		game.levelChangeAnimation = 0
		game.objects = Map1().objects.filter(
			(object) =>
				object.coordinateY !== 16 ||
				object.coordinateX < 88 ||
				object.coordinateX > 112
		)
		game.enemies = []
		const breached = buildSnapshot(game, createMemory())

		expect(flagWall(breached)).toEqual({ bricks: 4, breached: true })
	})
})

describe('drillValue', () => {
	it('ranks the brick between the AI and an enemy above a brick beside it', () => {
		const between = new GameObject('BRICK', 5, 6)
		const beside = new GameObject('BRICK', 6, 5)
		const snapshot = emptySnapshot([between, beside], [makeEnemy(40, 72)])

		expect(
			drillValue(
				snapshot,
				{ x: between.coordinateX, y: between.coordinateY },
				null
			)
		).toBe(3)
		expect(
			drillValue(
				snapshot,
				{ x: beside.coordinateX, y: beside.coordinateY },
				null
			)
		).toBe(0)
	})

	it('values a brick that lines up with the goal when no enemy is behind it', () => {
		const brick = new GameObject('BRICK', 5, 6)
		const snapshot = emptySnapshot([brick])

		expect(
			drillValue(
				snapshot,
				{ x: brick.coordinateX, y: brick.coordinateY },
				{ kind: 'patrol', x: 40, y: 120 }
			)
		).toBe(2)
	})
})

describe('chooseDrill', () => {
	it('picks the brick that opens the lane on the enemy', () => {
		const up = new GameObject('BRICK', 5, 6)
		const right = new GameObject('BRICK', 6, 5)
		const snapshot = emptySnapshot([up, right], [makeEnemy(72, 40)])

		expect(chooseDrill(snapshot, null, AI_TIER_FEATURES.elite)).toEqual({
			x: 48,
			y: 40,
			direction: 'RIGHT',
		})
	})

	it('returns null when the only brick in reach has the player in line', () => {
		const up = new GameObject('BRICK', 5, 6)
		const snapshot = emptySnapshot([up])
		snapshot.player.x = 40
		snapshot.player.y = 64

		expect(chooseDrill(snapshot, null, AI_TIER_FEATURES.elite)).toBeNull()
	})

	it('stays null for tiers that do not drill', () => {
		const up = new GameObject('BRICK', 5, 6)
		const snapshot = emptySnapshot([up])

		expect(
			chooseDrill(snapshot, null, AI_TIER_FEATURES.beginner)
		).toBeNull()
	})
})
