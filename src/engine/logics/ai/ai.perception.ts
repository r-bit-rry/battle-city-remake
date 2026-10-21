import { Game } from '../../instances'
import { isEnemy, isImpassibleGameObject, isPlayerDead } from '../../utils'
import { TypeEnemyTank } from '../../types'
import {
	AiBonusSnapshot,
	AiBulletSnapshot,
	AiEnemySnapshot,
	AiMemory,
	AiObstacleSnapshot,
	AiPlayerSnapshot,
	AiSnapshot,
	PlayerIntent,
} from './ai.types'

export const FLAG_X = 103
export const FLAG_Y = 7
export const GUARD_Y = 31
export const PLAYER_TRACK_SIZE = 60

export const BLOCK_CELLS = 32
export const BLOCK_FREE = 0
export const BLOCK_BRICK = 1
export const BLOCK_SOLID = 2
export const BLOCK_FLAG = 3

export const createMemory = (): AiMemory => ({
	goal: null,
	goalScore: 0,
	cooldown: 0,
	fireCooldown: 0,
	path: null,
	pathSignature: null,
	danger: null,
	dangerKey: null,
	lastX: -1,
	lastY: -1,
	commitDir: null,
	commitTicks: 0,
	noProgressTicks: 0,
	baseAlertTicks: 0,
	playerTrack: [],
	lastTargetId: null,
})

export const inferPlayerIntent = (
	track: { x: number; y: number }[],
	player: AiPlayerSnapshot
): PlayerIntent => {
	if (player.dead || player.lives === 0) return 'dead'
	if (player.lives === 1) return 'retreating'
	if (track.length < 2) return 'holding'

	const dy = track[track.length - 1].y - track[0].y
	if (dy > 16) return 'pushing'
	if (dy < -16) return 'retreating'

	return 'holding'
}

const mapSignature = (game: Game) => {
	let hash = game.isFlagAlive ? 1 : 0
	for (const object of game.objects) {
		hash = (hash * 31 + object.coordinateX * 8 + object.coordinateY) | 0
	}

	return String(hash)
}

export const buildSnapshot = (game: Game, memory: AiMemory): AiSnapshot => {
	const ai = game.p2
	if (!ai) throw new Error('AI snapshot requires p2')

	memory.playerTrack.push({
		x: game.p1.coordinateX,
		y: game.p1.coordinateY,
	})
	if (memory.playerTrack.length > PLAYER_TRACK_SIZE)
		memory.playerTrack.shift()

	const player: AiPlayerSnapshot = {
		x: game.p1.coordinateX,
		y: game.p1.coordinateY,
		direction: game.p1.direction,
		lives: game.p1.lives,
		dead: isPlayerDead(game.p1),
	}

	const enemies: AiEnemySnapshot[] = game.enemies
		.filter((enemy) => !enemy.spawnAnimation)
		.map((enemy) => ({
			id: enemy.id,
			x: enemy.coordinateX,
			y: enemy.coordinateY,
			direction: enemy.direction,
			type: enemy.type as TypeEnemyTank,
			speed: enemy.type === 'SPEEDY' ? 2 : 1,
			carrier: Boolean(enemy.bonus),
			lives: enemy.lives,
			availableBullets: enemy.availableBullets,
		}))

	const bullets: AiBulletSnapshot[] = game.bullets.map((bullet) => ({
		id: bullet.id,
		x: bullet.coordinateX,
		y: bullet.coordinateY,
		direction: bullet.direction,
		speed: bullet.speed,
		enemy: isEnemy(bullet.shooter),
	}))

	const bonuses: AiBonusSnapshot[] = game.bonuses.map((bonus) => ({
		id: bonus.id,
		x: bonus.coordinateX,
		y: bonus.coordinateY,
		type: bonus.type,
		lifeTime: bonus.lifeTime,
	}))

	const obstacles: AiObstacleSnapshot[] = game.objects
		.filter((object) => isImpassibleGameObject(object.type))
		.map((object) => ({
			x: object.coordinateX,
			y: object.coordinateY,
			destructible: object.type === 'BRICK',
			blocksBullets: object.type !== 'WATER',
			flag: object.type === 'FLAG',
		}))

	// Obstacle origins are 8 px aligned (GameObject snaps to x * 8), so one cell
	// per obstacle is enough for obstacleAt's four-probe lookup.
	const blocked = new Uint8Array(BLOCK_CELLS * BLOCK_CELLS)
	const blockedOwner = new Uint16Array(BLOCK_CELLS * BLOCK_CELLS)
	for (let index = 0; index < obstacles.length; index++) {
		const obstacle = obstacles[index]
		if (!obstacle.blocksBullets) continue
		const cell = (obstacle.y >> 3) * BLOCK_CELLS + (obstacle.x >> 3)
		blocked[cell] = obstacle.flag
			? BLOCK_FLAG
			: obstacle.destructible
				? BLOCK_BRICK
				: BLOCK_SOLID
		blockedOwner[cell] = index + 1
	}

	return {
		ai: {
			id: ai.id,
			x: ai.coordinateX,
			y: ai.coordinateY,
			direction: ai.direction,
			type: ai.type,
			lives: ai.lives,
			availableBullets: ai.availableBullets,
		},
		player,
		enemies,
		bullets,
		bonuses,
		obstacles,
		blocked,
		blockedOwner,
		base: { x: FLAG_X, y: FLAG_Y, alive: game.isFlagAlive },
		mapSignature: mapSignature(game),
		playerIntent: inferPlayerIntent(memory.playerTrack, player),
	}
}
