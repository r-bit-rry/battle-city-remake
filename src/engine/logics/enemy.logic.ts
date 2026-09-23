import { Game } from '../instances'
import { isPlayerDead } from '../utils'

export const enemiesSpawnLogic = (game: Game) => {
	const {
		enemies,
		enemyList,
		enemySpawnCooldown,
		p1,
		p2,
		enemySpawnPosition,
	} = game
	if (enemies.length === 4 || enemyList.length === 0) return

	if (enemySpawnCooldown !== 0) {
		return game.enemySpawnCooldown--
	}

	const busyCoordinates = [...enemies]
	if (!isPlayerDead(p1)) busyCoordinates.push(p1)
	if (p2 && !isPlayerDead(p2)) busyCoordinates.push(p2)

	let isMiddleFree = true
	let isRightFree = true
	let isLeftFree = true

	for (let i = 0; i < busyCoordinates.length; i++) {
		const { coordinateX, coordinateY } = busyCoordinates[i]
		if (coordinateY >= 185) {
			if (coordinateX <= 22) {
				isLeftFree = false
			} else if (coordinateX >= 82 && coordinateX <= 112) {
				isMiddleFree = false
			} else if (coordinateX >= 185) {
				isRightFree = false
			}
		}
	}

	if (enemySpawnPosition === 'middle') {
		if (isMiddleFree) {
			return game.spawnEnemy('middle')
		} else if (isRightFree) {
			return game.spawnEnemy('right')
		} else if (isLeftFree) {
			return game.spawnEnemy('left')
		}
	} else if (enemySpawnPosition === 'right') {
		if (isRightFree) {
			return game.spawnEnemy('right')
		} else if (isLeftFree) {
			return game.spawnEnemy('left')
		} else if (isMiddleFree) {
			return game.spawnEnemy('middle')
		}
	} else {
		if (isLeftFree) {
			return game.spawnEnemy('left')
		} else if (isMiddleFree) {
			return game.spawnEnemy('middle')
		} else if (isRightFree) {
			return game.spawnEnemy('right')
		}
	}
}

export const enemiesFrameLogic = (game: Game) => {
	const { enemies, p1, p2, objects, timerBonus, sounds, bullets } = game

	if (timerBonus) {
		for (let i = 0; i < enemies.length; i++) {
			const enemy = enemies[i]
			if (enemy.spawnAnimation) {
				enemy.spawnAnimation--
				continue
			}
		}
		return
	}

	for (let i = 0; i < enemies.length; i++) {
		const enemy = enemies[i]
		if (enemy.spawnAnimation) {
			enemy.spawnAnimation--
			continue
		}
		for (let l = enemy.type === 'SPEEDY' ? 2 : 1; l > 0; l--) {
			const { nextMoves, direction, id } = enemy

			if (!nextMoves) continue

			const busyCoordinates = [
				...enemies.filter((e) => e.id !== id),
				...objects,
			]
			if (!isPlayerDead(p1)) busyCoordinates.push(p1)
			if (p2 && !isPlayerDead(p2)) busyCoordinates.push(p2)

			if (nextMoves.direction !== direction) {
				enemy.direction = nextMoves.direction
				enemy.alignToGrid(busyCoordinates)
			} else {
				enemy.move(busyCoordinates)
			}
			sounds.enemy_move = true
			nextMoves.repeat--
			if (nextMoves.repeat === 1) {
				enemy.generateNextMoves()
			}
		}

		if (enemy.type === 'SPEEDY') {
			enemy.tick = enemy.tick === 1 ? 2 : 1
		}

		if (
			enemy.availableBullets !== 0 &&
			Math.floor(Math.random() * 18 + 1) === 1
		) {
			enemy.shoot(bullets)
		}
	}
}
