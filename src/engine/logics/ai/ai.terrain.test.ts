// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GameObject } from '../../instances'
import { Map1 } from '../../maps/1'
import { AI_TIER_FEATURES } from './ai.profiles'
import { buildSnapshot, createMemory } from './ai.perception'
import { chooseDrill, flagWall } from './ai.terrain'
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

	it('reports a breach when a single brick of a side is gone', () => {
		// one ring brick per side: a lane-wide hole is enough for a bullet
		for (const [tileX, tileY] of [
			[11, 0],
			[14, 1],
			[12, 2],
		]) {
			const game = makeAiGame('elite')
			game.levelChangeAnimation = 0
			game.objects = Map1().objects.filter(
				(object) =>
					object.coordinateX !== tileX * 8 ||
					object.coordinateY !== tileY * 8
			)
			game.enemies = []

			expect(
				flagWall(buildSnapshot(game, createMemory())).breached,
				`${tileX},${tileY}`
			).toBe(true)
		}
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

	it('ranks an enemy behind a brick above a goal-aligned brick', () => {
		// Up: the enemy stands on that lane (+3). Right: it only shortens the
		// path to the goal (+2). Ranking, not direction order, decides.
		const up = new GameObject('BRICK', 5, 6)
		const right = new GameObject('BRICK', 6, 5)
		const snapshot = emptySnapshot([up, right], [makeEnemy(40, 72)])

		expect(
			chooseDrill(
				snapshot,
				{ kind: 'patrol', x: 120, y: 40 },
				AI_TIER_FEATURES.elite
			)
		).toEqual({ x: 40, y: 48, direction: 'TOP' })
	})

	it('fires down the axis the brick stands on, not the probe that found it', () => {
		// Tank at x=41, y=39: only the RIGHT probe's neighbourhood reaches the
		// brick at (48,40), but the tank can shoot that brick upwards. The old
		// label said RIGHT and the tank fired at a wall, which is why laneValue
		// and the drill's axis ranking were indistinguishable in this suite.
		const brick = new GameObject('BRICK', 6, 5)
		const snapshot = emptySnapshot([brick], [makeEnemy(44, 72)])
		snapshot.ai.x = 41
		snapshot.ai.y = 39

		expect(chooseDrill(snapshot, null, AI_TIER_FEATURES.elite)).toEqual({
			x: 48,
			y: 40,
			direction: 'TOP',
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

	it('never drills its own flag wall, for any goal kind', () => {
		// AI beside the flag ring (brick at 96,24 is 7 px from the flag), an
		// enemy on the far side of it: without the guard this is a +3 brick.
		const brick = new GameObject('BRICK', 12, 3)
		const snapshot = emptySnapshot([brick], [makeEnemy(140, 24)])
		snapshot.ai.x = 88
		snapshot.ai.y = 24
		snapshot.ai.direction = 'RIGHT'

		for (const goal of [
			{ kind: 'engage' as const, x: 140, y: 24 },
			{ kind: 'collect' as const, x: 140, y: 24 },
			{ kind: 'defend' as const, x: 140, y: 24 },
			null,
		])
			expect(
				chooseDrill(snapshot, goal, AI_TIER_FEATURES.elite)
			).toBeNull()
	})
})
