import { Bonus, Game, Tank } from '../../instances'
import {
	BusyCoordinates,
	GameSettings,
	TypeAiLevel,
	TypeAiRole,
	TypeBonus,
	TypeEnemyTank,
} from '../../types'

export const aiSettings: GameSettings = {
	hardcore: false,
	playerLevel: 0,
	friendlyFire: false,
	survivorRespawn: false,
	soundPack: 'default',
}

export const makeAiGame = (
	level: TypeAiLevel = 'pro',
	role: TypeAiRole = 'wingman',
	settings: GameSettings = aiSettings
) => {
	const game = new Game('local', 'p1', 'p2', settings, undefined, level, role)
	game.p1.spawnAnimation = 0
	game.p1.helmet = 0
	if (game.p2) {
		game.p2.spawnAnimation = 0
		game.p2.helmet = 0
	}

	return game
}

export const makeEnemy = (
	x: number,
	y: number,
	type: TypeEnemyTank = 'NORMAL',
	bonus?: TypeBonus
) => {
	const enemy = new Tank('middle', type, undefined, bonus)
	enemy.coordinateX = x
	enemy.coordinateY = y
	enemy.spawnAnimation = 0

	return enemy
}

export const makeBonus = (x: number, y: number, type: TypeBonus = 'STAR') => {
	const bonus = new Bonus(type)
	bonus.coordinateX = x
	bonus.coordinateY = y

	return bonus
}

export const brick = (x: number, y: number): BusyCoordinates => ({
	id: `brick-${x}-${y}`,
	type: 'BRICK',
	coordinateX: x,
	coordinateY: y,
})

export const wallColumn = (x: number, fromY: number, toY: number) =>
	Array.from({ length: (toY - fromY) / 8 + 1 }, (_, i) =>
		brick(x, fromY + i * 8)
	)
