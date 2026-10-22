import { Game } from '../../instances'
import { isEnemy, isImpassibleGameObject, isPlayerDead } from '../../utils'
import { TypeEnemyTank } from '../../types'
import {
	AiBonusSnapshot,
	AiGoal,
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
/** Frames a progress window spans: one second at 60 fps. */
export const PROGRESS_WINDOW = 60
/** Net displacement that counts as having gone somewhere. */
export const PROGRESS_DISTANCE = 8

/**
 * A limit cycle moves a pixel every tick and still goes nowhere, so progress
 * is net displacement over the whole window rather than the last frame. A tank
 * that stands still on purpose (guard duty, holding a firing line) is not
 * wedged, so the window must also have travelled a real distance.
 */
export const wedgedInWindow = (
	track: { x: number; y: number }[],
	x: number,
	y: number
) => {
	if (track.length < 2) return false

	let travelled = 0
	for (let i = 1; i < track.length; i++)
		travelled += Math.hypot(
			track[i].x - track[i - 1].x,
			track[i].y - track[i - 1].y
		)

	return (
		travelled >= PROGRESS_DISTANCE &&
		Math.hypot(x - track[0].x, y - track[0].y) < PROGRESS_DISTANCE
	)
}

/**
 * Progress toward one goal. The window restarts whenever the goal changes, so
 * a target that walks away is not mistaken for a stall, and a held position
 * (defend) is not a journey. `reach` is the distance at which it counts as
 * arrived. Updates `memory`'s stall window.
 */
export const goalStalled = (
	memory: AiMemory,
	goal: AiGoal | null,
	x: number,
	y: number,
	reach: number,
	cycle: boolean
) => {
	const gap = goal ? Math.hypot(x - goal.x, y - goal.y) : 0
	const key = goal
		? `${goal.kind}:${goal.enemyId ?? ''}:${goal.bonusId ?? ''}:${goal.x},${goal.y}`
		: null
	if (key !== memory.stallKey) {
		memory.stallKey = key
		memory.stallGap = gap
		memory.stallTicks = 0
	}
	memory.stallTicks++

	return (
		goal !== null &&
		(goal.kind !== 'defend' || cycle) &&
		memory.stallTicks >= PROGRESS_WINDOW &&
		gap > reach &&
		gap >= memory.stallGap
	)
}

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
	wedgedTicks: 0,
	stallKey: null,
	stallGap: 0,
	stallTicks: 0,
	playerTrack: [],
	positionTrack: [],
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
