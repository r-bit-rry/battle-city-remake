import { Game } from '../instances'
import { isPlayerCanMove, isPlayerCanShoot, isPlayerDead } from '../utils'

const playerFrameLogic = (game: Game, num: 1 | 2) => {
	// Detecting tank of the current player
	const p = num === 1 ? game.p1 : game.p2
	if (!p) return

	const controller = num === 1 ? game.p1Controls : game.p2Controls
	const pAnother = num === 2 ? game.p1 : game.p2

	const { enemies, objects, sounds, bullets } = game
	const { fire, move, pause } = controller
	const { spawnAnimation, helmet, deathCooldown, direction } = p

	if (spawnAnimation) p.spawnAnimation--

	if (pause) game.pause(controller)

	if (game.isPaused) return

	if (helmet !== 0) p.helmet--

	if (deathCooldown === 1 && p.lives > 0) p.respawn()

	if (deathCooldown > 0) p.deathCooldown -= 1

	if (fire) {
		controller.fire = false

		if (isPlayerCanShoot(p)) {
			sounds.shoot = true
			p.shoot(bullets)
		}
	}

	if (move) {
		if (!isPlayerCanMove(p)) {
			controller.move = null
			return
		}

		const busyCoordinates = [...enemies, ...objects]
		if (pAnother && !isPlayerDead(pAnother)) busyCoordinates.push(pAnother)

		if (move !== direction) {
			p.direction = move
			p.alignToGrid(busyCoordinates)
		} else {
			p.move(busyCoordinates)
		}

		sounds.player_move = true
		controller.move = null
	}
}

export const playersFrameLogic = (game: Game) => {
	playerFrameLogic(game, 1)
	playerFrameLogic(game, 2)
}
