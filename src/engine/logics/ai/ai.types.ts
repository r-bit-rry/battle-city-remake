import {
	BusyCoordinates,
	TypeAiLevel,
	TypeAiRole,
	TypeBonus,
	TypeDirection,
	TypeEnemyTank,
	TypeTank,
} from '../../types'

export type AiGoalKind =
	| 'defend'
	| 'engage'
	| 'collect'
	| 'support'
	| 'retreat'
	| 'patrol'

export interface AiGoal {
	kind: AiGoalKind
	x: number
	y: number
	enemyId?: string
	bonusId?: string
	brick?: { x: number; y: number }
}

export interface AiTierFeatures {
	pathfinding: 'greedy' | 'bfs' | 'astar' | 'astar-drill'
	decisionInterval: number
	fireCooldown: number
	aimTolerance: number
	aimJitter: number
	aimLead: boolean
	dodgeHorizon: number
	reactiveDodge: boolean
	blockBullets: boolean
	escapeBrick: boolean
	baseDangerRadius: number
	leashRange: number
	engageRange: number
	bonusLogic: 'none' | 'safe' | 'valued'
	yieldBonuses: boolean
	coordination: boolean
	brickDrilling: boolean
	intercept: boolean
	retreatLives: number
}

export interface AiRoleProfile {
	weights: Record<AiGoalKind, number>
	patrolAnchor: 'base' | 'player' | 'middle'
	retreatOffset: number
}

export interface AiEnemySnapshot {
	id: string
	x: number
	y: number
	direction: TypeDirection
	type: TypeEnemyTank
	speed: number
	carrier: boolean
	lives: number
	availableBullets: number
}

export interface AiBulletSnapshot {
	id: string
	x: number
	y: number
	direction: TypeDirection
	speed: number
	enemy: boolean
}

export interface AiBonusSnapshot {
	id: string
	x: number
	y: number
	type: TypeBonus
	lifeTime: number
}

export interface AiPlayerSnapshot {
	x: number
	y: number
	direction: TypeDirection
	lives: number
	dead: boolean
}

export interface AiObstacleSnapshot {
	x: number
	y: number
	destructible: boolean
	blocksBullets: boolean
	flag: boolean
}

export type PlayerIntent = 'pushing' | 'holding' | 'retreating' | 'dead'

export interface AiSnapshot {
	ai: {
		id: string
		x: number
		y: number
		direction: TypeDirection
		type: TypeTank
		lives: number
		availableBullets: number
	}
	player: AiPlayerSnapshot
	enemies: AiEnemySnapshot[]
	bullets: AiBulletSnapshot[]
	bonuses: AiBonusSnapshot[]
	obstacles: AiObstacleSnapshot[]
	/** 32x32 cells of 8 px: 0 free, 1 brick, 2 solid, 3 flag (solid but ignorable). */
	blocked: Uint8Array
	/** 1-based index into `obstacles` per blocked cell, 0 = none. */
	blockedOwner: Uint16Array
	mapSignature: string
	playerIntent: PlayerIntent
}

export interface Threat {
	enemyId: string
	score: number
	hasLineToBase: boolean
	aimingPlayer: boolean
}

export interface DangerMap {
	/** frame until a lane cell is hit, keyed by `yi * LANE_COUNT + xi` */
	cells: Map<number, number>
}

export interface LanePath {
	waypoints: { x: number; y: number }[]
}

export interface AiMemory {
	goal: AiGoal | null
	goalScore: number
	cooldown: number
	fireCooldown: number
	path: LanePath | null
	pathSignature: string | null
	danger: DangerMap | null
	dangerKey: string | null
	lastX: number
	lastY: number
	/** Heading the AI keeps steering down before it re-decides a turn. */
	commitDir: TypeDirection | null
	commitTicks: number
	/** Consecutive frames the tank's position did not change. */
	noProgressTicks: number
	/** Consecutive frames the progress window has been wedged. */
	wedgedTicks: number
	/** Identity of the goal the stall window belongs to. */
	stallKey: string | null
	/** Distance to that goal when the current stall window started. */
	stallGap: number
	/** Frames the current stall window has been open. */
	stallTicks: number
	playerTrack: { x: number; y: number }[]
	/** AI positions over the progress window, oldest first. */
	positionTrack: { x: number; y: number }[]
}

export interface AiDecision {
	move: TypeDirection | null
	fire: boolean
}

export type { TypeAiLevel, TypeAiRole, BusyCoordinates }
