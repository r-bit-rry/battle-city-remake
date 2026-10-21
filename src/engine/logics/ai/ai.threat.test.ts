// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Bullet, GameObject } from '../../instances'
import { MapInstance } from '../../maps'
import { AiSnapshot } from './ai.types'
import { buildSnapshot, createMemory } from './ai.perception'
import {
	buildDangerMap,
	computeThreats,
	findIncomingBullet,
	isCellDangerous,
	obstacleAt,
	predictedHit,
} from './ai.threat'
import { makeAiGame, makeEnemy } from './ai.test-utils'

const snapshotOf = (game: ReturnType<typeof makeAiGame>) =>
	buildSnapshot(game, createMemory())

// Oracle: the linear scan obstacleAt used before the cell grid. Kept verbatim.
const linearObstacleAt = (
	snapshot: AiSnapshot,
	x: number,
	y: number,
	ignoreFlag = false
) =>
	snapshot.obstacles.find(
		(object) =>
			object.blocksBullets &&
			!(ignoreFlag && object.flag) &&
			x >= object.x - 2 &&
			x <= object.x + 9 &&
			y >= object.y - 2 &&
			y <= object.y + 9
	)

const mulberry32 = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

	return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// half uniform, half hugging an obstacle box so the 12 px edges get probed
const samplePoints = (
	snapshot: AiSnapshot,
	random: () => number,
	count: number,
	maxX = 220,
	maxY = 220
) => {
	const points: { x: number; y: number }[] = []
	for (let i = 0; i < count / 2; i++)
		points.push({
			x: Math.round(-4 + random() * maxX),
			y: Math.round(-4 + random() * maxY),
		})
	for (let i = 0; i < count / 2; i++) {
		const obstacle =
			snapshot.obstacles[Math.floor(random() * snapshot.obstacles.length)]
		points.push({
			x: obstacle.x + Math.round(-6 + random() * 19),
			y: obstacle.y + Math.round(-6 + random() * 19),
		})
	}

	return points
}

describe('obstacleAt', () => {
	const fixture = () => {
		const game = makeAiGame()
		game.objects = [
			...MapInstance(),
			new GameObject('BRICK', 4, 4),
			new GameObject('STONE', 20, 12),
			new GameObject('WATER', 6, 6),
			...Array.from(
				{ length: 6 },
				(_, i) => new GameObject('BRICK', 16 + i, 18)
			),
		]

		return buildSnapshot(game, createMemory())
	}

	it('matches the linear scan on 300 pseudo-random points', () => {
		const snapshot = fixture()
		const mismatches: string[] = []
		let blocked = 0

		for (const { x, y } of samplePoints(snapshot, mulberry32(1337), 300)) {
			const expected = Boolean(linearObstacleAt(snapshot, x, y))
			if (expected) blocked++
			if (Boolean(obstacleAt(snapshot, x, y)) !== expected)
				mismatches.push(`${x},${y}`)
		}

		expect(mismatches).toEqual([])
		// the sample must actually hit walls, or the comparison proves nothing
		expect(blocked).toBeGreaterThan(60)
		expect(blocked).toBeLessThan(299)
	})

	it('matches the linear scan when the flag is ignored', () => {
		const snapshot = fixture()
		const mismatches: string[] = []
		let blocked = 0

		for (const { x, y } of samplePoints(snapshot, mulberry32(4242), 300)) {
			const expected = Boolean(linearObstacleAt(snapshot, x, y, true))
			if (expected) blocked++
			if (Boolean(obstacleAt(snapshot, x, y, true)) !== expected)
				mismatches.push(`${x},${y}`)
		}

		expect(mismatches).toEqual([])
		expect(blocked).toBeGreaterThan(5)
	})

	it('stops a bullet ray at a brick', () => {
		const game = makeAiGame()
		game.objects = [new GameObject('BRICK', 12, 12)]
		const snapshot = buildSnapshot(game, createMemory())

		expect(obstacleAt(snapshot, 95, 100)).toBeTruthy()
		expect(obstacleAt(snapshot, 90, 100)).toBeFalsy()
	})

	it('reports the obstacle that owns the cell', () => {
		const game = makeAiGame()
		game.objects = [new GameObject('STONE', 12, 12)]
		const snapshot = buildSnapshot(game, createMemory())
		const hit = obstacleAt(snapshot, 96, 96)

		expect(hit).toBe(snapshot.obstacles[0])
		expect(hit?.blocksBullets).toBe(true)
		expect(hit?.destructible).toBe(false)
	})

	it('agrees with the path grid on brick cells', () => {
		const snapshot = fixture()
		const brickCell = snapshot.obstacles.find(
			(object) => object.destructible
		)!

		expect(
			obstacleAt(snapshot, brickCell.x + 3, brickCell.y + 3)
		).toBeTruthy()
		expect(
			obstacleAt(snapshot, brickCell.x + 3, brickCell.y + 3, true)
		).toBeTruthy()
	})
})

describe('danger map keys', () => {
	it('is keyed by lane indices so lookups stay numeric', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.bullets = [new Bullet(80, 100, 'RIGHT', 'NORMAL', 'enemy-1')]

		const danger = buildDangerMap(snapshotOf(game), 30)

		expect(
			[...danger.cells.keys()].every((key) => typeof key === 'number')
		).toBe(true)
	})

	it('rebuilds into the map it was handed as a cache', () => {
		const game = makeAiGame()
		game.p2!.coordinateX = 100
		game.p2!.coordinateY = 100
		game.bullets = [new Bullet(80, 100, 'RIGHT', 'NORMAL', 'enemy-1')]
		const cache = buildDangerMap(snapshotOf(game), 30)
		game.bullets = []

		const rebuilt = buildDangerMap(snapshotOf(game), 30, cache)

		expect(rebuilt).toBe(cache)
		expect(rebuilt.cells.size).toBe(0)
		expect(isCellDangerous(rebuilt, 100, 100, 30)).toBe(false)
	})
})

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

	it('reaches the flag past the real base structure but not past a wall', () => {
		const game = makeAiGame()
		game.enemies = [makeEnemy(103, 120)]
		game.objects = MapInstance().filter((object) => object.type === 'FLAG')
		const snapshot = snapshotOf(game)
		const flags = snapshot.obstacles.filter((object) => object.flag)

		expect(flags.map((object) => [object.x, object.y])).toEqual([
			[96, 0],
			[96, 8],
			[104, 0],
			[104, 8],
		])
		expect(flags.every((object) => object.blocksBullets)).toBe(true)
		expect(computeThreats(snapshot)[0].hasLineToBase).toBe(true)

		game.objects = [
			...game.objects,
			new GameObject('STONE', 12, 8),
			new GameObject('STONE', 13, 8),
		]

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
