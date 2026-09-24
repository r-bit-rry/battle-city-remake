import { Game, Player } from '../instances'
import { BusyCoordinates, TypeObject, TypeTank } from '../types'

export const isEnemy = (type: TypeTank | TypeObject) =>
	type === 'NORMAL' || type === 'SPEEDY' || type === 'HEAVY' ? true : false

export const isPlayer = (type: TypeTank | TypeObject) =>
	type === 'LVL_0' || type === 'LVL_1' || type === 'LVL_2' || type === 'LVL_3'
		? true
		: false

export const isImpassibleGameObject = (type: TypeTank | TypeObject) =>
	type === 'BRICK' || type === 'WATER' || type === 'STONE' || type === 'FLAG'
		? true
		: false

export const isTank = (type: TypeTank | TypeObject) =>
	isEnemy(type) || isPlayer(type) ? true : false

// 15x15 tank box vs blocks (8x8) and other tanks (15x15).
// Touching boxes count as blocked, matching Tank.move() semantics.
export const isTankBlockedAt = (
	tank: { id: string },
	x: number,
	y: number,
	busyCoordinates: BusyCoordinates[]
) => {
	if (x < 7 || x > 200 || y < 7 || y > 200) return true

	for (let i = 0; i < busyCoordinates.length; i++) {
		const busy = busyCoordinates[i]
		if (busy.id === tank.id) continue
		if (!isTank(busy.type) && !isImpassibleGameObject(busy.type)) continue

		const minX = isTank(busy.type) ? busy.coordinateX - 7 : busy.coordinateX
		const minY = isTank(busy.type) ? busy.coordinateY - 7 : busy.coordinateY
		const maxX = busy.coordinateX + 7
		const maxY = busy.coordinateY + 7

		if (x - 7 <= maxX && minX <= x + 7 && y - 7 <= maxY && minY <= y + 7)
			return true
	}

	return false
}

export const isPlayerDead = (p: Player) =>
	p.lives && !p.deathCooldown ? false : true

export const isGameOver = (game: Game) => {
	const { p1, p2, isFlagAlive } = game
	return (!game.gameOverAnimation && !p1.lives && (!p2 || !p2.lives)) ||
		(!isFlagAlive && !game.gameOverAnimation)
		? true
		: false
}

export const isPlayerCanShoot = (p: Player) =>
	p.deathCooldown || !p.availableBullets || p.spawnAnimation || !p.lives
		? false
		: true

export const isPlayerCanMove = (p: Player) =>
	p.deathCooldown || p.spawnAnimation || !p.lives ? false : true

export const isBulletHitObject = (
	busyX: number,
	busyY: number,
	x: number,
	y: number
) =>
	((busyY === y + 2 ||
		busyY === y - 2 ||
		busyY + 7 === y + 2 ||
		busyY + 7 === y - 2) &&
		busyX >= x - 8 &&
		busyX <= x + 1) ||
	((busyX === x + 2 ||
		busyX === x - 2 ||
		busyX + 7 === x + 2 ||
		busyX + 7 === x - 2) &&
		busyY >= y - 8 &&
		busyY <= y + 1)

export const isBulletHitTank = (
	busyX: number,
	busyY: number,
	x: number,
	y: number
) =>
	((busyY - 7 === y + 2 ||
		busyY - 7 === y - 2 ||
		busyY + 7 === y + 2 ||
		busyY + 7 === y - 2) &&
		busyX >= x - 8 &&
		busyX <= x + 8) ||
	((busyX - 7 === x + 2 ||
		busyX - 7 === x - 2 ||
		busyX + 7 === x + 2 ||
		busyX + 7 === x - 2) &&
		busyY >= y - 8 &&
		busyY <= y + 8)

export const isBulletHitBullet = (
	busyX: number,
	busyY: number,
	x: number,
	y: number
) => Math.abs(busyX - x) <= 5 && Math.abs(busyY - y) <= 2

export const isOneSpeedShooter = (shooter: TypeTank) =>
	shooter === 'NORMAL' ||
	shooter === 'SPEEDY' ||
	shooter === 'HEAVY' ||
	shooter === 'LVL_0'
