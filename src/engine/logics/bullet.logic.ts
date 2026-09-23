import { Bang, Bullet, Game } from '../instances'
import { BusyCoordinates } from '../types'
import {
	isBulletHitBullet,
	isBulletHitObject,
	isBulletHitTank,
	isEnemy,
	isPlayer,
	isPlayerDead,
	mutationFilter,
	hitEnemy,
	killPlayer,
	deleteBlock,
} from '../utils'

export const bulletsFrameLogic = (game: Game) => {
	const { bullets, objects, p1, p2, enemies, sounds, bangs } = game
	const busyCoordinates: BusyCoordinates[] = [
		...enemies,
		...bullets,
		...objects,
	]
	const allTanks = [...enemies]

	if (!isPlayerDead(p1)) {
		busyCoordinates.push(p1)
		allTanks.push(p1)
	}

	if (p2 && !isPlayerDead(p2)) {
		busyCoordinates.push(p2)
		allTanks.push(p2)
	}

	for (let i = 0; i < bullets.length; i++) {
		let willHit = false

		for (let l = bullets[i].speed + 1; l !== 0; l--) {
			const bullet = bullets[i]
			if (!bullet || willHit) break

			const {
				coordinateX: x,
				coordinateY: y,
				direction,
				shooter,
				shooterId,
				level,
			} = bullet

			for (let m = 0; m < busyCoordinates.length; m++) {
				const {
					coordinateX: busyX,
					coordinateY: busyY,
					id,
					type,
				} = busyCoordinates[m]

				if (type === 'BRICK' && isBulletHitObject(busyX, busyY, x, y)) {
					deleteBlock(id, objects)
					if (!isEnemy(shooter)) sounds.hit_1 = true
					willHit = true
				}

				if (type === 'STONE' && isBulletHitObject(busyX, busyY, x, y)) {
					if (level > 1) {
						deleteBlock(id, game.objects)
						sounds.hit_1 = true
					} else {
						if (!isEnemy(shooter)) sounds.heavy_hit = true
					}
					willHit = true
				}

				if (
					type === 'FLAG' &&
					game.isFlagAlive &&
					isBulletHitObject(busyX, busyY, x, y)
				) {
					game.isFlagAlive = false
					sounds.flag_bang = true
					willHit = true
				}

				if (isPlayer(type) && isBulletHitTank(busyX, busyY, x, y)) {
					if (
						isEnemy(shooter) ||
						(game.settings.friendlyFire && shooterId !== id)
					) {
						killPlayer(id, game)
					}
					if (id !== shooterId) willHit = true
				}
				if (isEnemy(type) && isBulletHitTank(busyX, busyY, x, y)) {
					if (!isEnemy(shooter)) willHit = hitEnemy(id, game)

					if (id !== shooterId) willHit = true
				}
				if (type === 'BULLET' && id !== bullet.id) {
					const secondBullet = bullets.find((b) => b.id === id)

					if (
						secondBullet &&
						secondBullet.shooterId !== shooterId &&
						isBulletHitBullet(busyX, busyY, x, y)
					) {
						willHit = true
						const tank = allTanks.find(
							(t) => t.id === secondBullet.shooterId
						)
						if (tank) {
							if (tank.type !== 'LVL_0') {
								tank.availableBullets++
							} else {
								if (tank.availableBullets === 0) {
									tank.availableBullets++
								}
							}
						}
						mutationFilter(bullets, (b: Bullet) => b.id !== id)
					}
				}
			}

			if (!willHit) {
				switch (direction) {
					case 'TOP':
						if (y > 204) {
							willHit = true
							if (!isEnemy(shooter)) sounds.heavy_hit = true
						} else {
							bullet.coordinateY += 1
						}
						break
					case 'BOTTOM':
						if (y < 2) {
							willHit = true
							if (!isEnemy(shooter)) sounds.heavy_hit = true
						} else {
							bullet.coordinateY -= 1
						}
						break
					case 'RIGHT':
						if (x > 204) {
							willHit = true
							if (!isEnemy(shooter)) sounds.heavy_hit = true
						} else {
							bullet.coordinateX += 1
						}
						break
					default:
						if (x < 3) {
							willHit = true
							if (!isEnemy(shooter)) sounds.heavy_hit = true
						} else {
							bullet.coordinateX -= 1
						}
						break
				}
			}
			if (willHit) {
				mutationFilter(bullets, (b: Bullet) => b.id !== bullet.id)
				bangs.push(new Bang('SMALL', x, y))

				const tank = allTanks.find((t) => t.id === shooterId)

				if (tank)
					if (tank.type !== 'LVL_0') {
						tank.availableBullets++
					} else {
						if (tank.availableBullets === 0) {
							tank.availableBullets++
						}
					}
			}
		}
	}
}
