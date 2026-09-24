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
	base: { x: number; y: number; alive: boolean }
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
	cells: Map<string, number>
}

export interface LanePath {
	waypoints: { x: number; y: number }[]
	brick: { x: number; y: number } | null
}

export interface AiMemory {
	goal: AiGoal | null
	goalScore: number
	cooldown: number
	fireCooldown: number
	path: LanePath | null
	pathSignature: string | null
	lastX: number
	lastY: number
	lastMove: TypeDirection | null
	stuckFrames: number
	stuckRecoveries: number
	playerTrack: { x: number; y: number }[]
	lastTargetId: string | null
}

export interface AiDecision {
	move: TypeDirection | null
	fire: boolean
}

export type { TypeAiLevel, TypeAiRole, BusyCoordinates }
