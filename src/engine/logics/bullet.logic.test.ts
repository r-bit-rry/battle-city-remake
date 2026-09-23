// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Bullet, Game } from '../instances'
import { TypeDirection, TypeTank } from '../types'
import { bulletsFrameLogic } from './bullet.logic'
import { playersFrameLogic } from './players.logic'

const settings = {
	hardcore: false,
	playerLevel: 0 as const,
	friendlyFire: false,
	survivorRespawn: false,
	soundPack: 'default' as const,
}

const makeGame = () => {
	const game = new Game('local', 'p1', null, settings)
	game.p1.spawnAnimation = 0
	game.p1.helmet = 0

	return game
}

const placeBullet = (
	x: number,
	y: number,
	direction: TypeDirection,
	shooter: TypeTank,
	shooterId: string
) => {
	const bullet = new Bullet(0, 0, direction, shooter, shooterId)
	bullet.coordinateX = x
	bullet.coordinateY = y

	return bullet
}

describe('bullet vs bullet collision', () => {
	it('cancels opposing bullets fired at point-blank range', () => {
		const game = makeGame()
		game.p1.coordinateX = 100
		game.p1.coordinateY = 103
		game.p1.direction = 'RIGHT'

		// Enemy fired a frame earlier: its bullet is already in flight and,
		// because the tanks are 15px apart, it spawned past the player's muzzle
		game.bullets = [placeBullet(106, 103, 'LEFT', 'NORMAL', 'enemy-1')]

		game.p1Controls.fire = true
		playersFrameLogic(game)

		expect(game.bullets).toHaveLength(2)

		bulletsFrameLogic(game)

		expect(game.bullets).toHaveLength(0)
	})

	it('does not cancel bullets from the same shooter', () => {
		const game = makeGame()
		game.bullets = [
			placeBullet(110, 103, 'RIGHT', 'LVL_0', game.p1.id),
			placeBullet(108, 103, 'RIGHT', 'LVL_0', game.p1.id),
		]

		bulletsFrameLogic(game)

		expect(game.bullets).toHaveLength(2)
	})

	it('cancels crossing bullets', () => {
		const game = makeGame()
		game.bullets = [
			placeBullet(100, 103, 'RIGHT', 'LVL_0', game.p1.id),
			placeBullet(105, 108, 'BOTTOM', 'NORMAL', 'enemy-1'),
		]

		bulletsFrameLogic(game)
		bulletsFrameLogic(game)

		expect(game.bullets).toHaveLength(0)
	})

	it('does not cancel bullets that are far apart', () => {
		const game = makeGame()
		game.bullets = [
			placeBullet(60, 103, 'RIGHT', 'LVL_0', game.p1.id),
			placeBullet(100, 103, 'LEFT', 'NORMAL', 'enemy-1'),
		]

		bulletsFrameLogic(game)

		expect(game.bullets).toHaveLength(2)
	})
})
