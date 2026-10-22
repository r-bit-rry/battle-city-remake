import { Game } from '../instances'
import { aiSettings, makeAiGame } from '../logics/ai/ai.test-utils'
import { PROGRESS_WINDOW, wedgedInWindow } from '../logics/ai/ai.perception'
import { getAiMemory } from '../logics/ai.logic'
import { gameFrame } from '../logics'
import { GameSettings, TypeAiLevel, TypeAiRole } from '../types'
import { isEnemy } from '../utils'

export interface SimOptions {
	tier: TypeAiLevel
	role: TypeAiRole
	seed: number
	settings: Partial<GameSettings>
}

export interface SimMetrics {
	ticks: number
	kills: number
	baseAlive: boolean
	aiAlive: boolean
	/** Ticks where the AI tank made no net progress over the last window. */
	stuckRatio: number
	/** Fraction of ticks spent on a defend goal. */
	defendShare: number
	friendlyFire: number
	p50Ms: number
	p99Ms: number
	maxMs: number
	score: number
}

// same PRNG the old bench inlined; Math.random is the only entropy on the AI path
const mulberry32 = (seed: number) => () => {
	seed |= 0
	seed = (seed + 0x6d2b79f5) | 0
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// the map is loaded once levelChangeAnimation reaches 60 during the start screen
const WARMUP = 61

const percentile = (sorted: number[], q: number) =>
	sorted.length
		? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
		: 0

// node-only: replaces the global Math.random while alive, so run one Sim at a time
export class Sim {
	readonly game: Game

	private readonly originalRandom = Math.random
	private readonly settings: GameSettings
	private readonly seen = new Set<string>()
	private lastLevel: number
	private ticks = 0
	private kills = 0
	private stuckTicks = 0
	private defendTicks = 0
	private positions: { x: number; y: number }[] = []
	private friendlyFire = 0
	private times: number[] = []

	constructor(o: Partial<SimOptions> = {}) {
		Math.random = mulberry32(o.seed ?? 1)
		this.settings = {
			...aiSettings,
			friendlyFire: true,
			...o.settings,
		}
		this.game = makeAiGame(o.tier, o.role, this.settings)
		this.lastLevel = this.game.level
		for (let i = 0; i < WARMUP; i++) this.tick(false)
	}

	step(ticks = 1) {
		for (let i = 0; i < ticks; i++) this.tick(true)
	}

	runUntil(stop: (game: Game) => boolean, maxTicks: number): SimMetrics {
		for (let i = 0; i < maxTicks && !stop(this.game); i++) this.tick(true)
		return this.metrics()
	}

	metrics(): SimMetrics {
		const sorted = [...this.times].sort((a, b) => a - b)
		const baseAlive = this.game.isFlagAlive
		return {
			ticks: this.ticks,
			kills: this.kills,
			baseAlive,
			aiAlive: !!this.game.p2?.lives,
			stuckRatio: this.ticks ? this.stuckTicks / this.ticks : 0,
			defendShare: this.ticks ? this.defendTicks / this.ticks : 0,
			friendlyFire: this.friendlyFire,
			p50Ms: percentile(sorted, 0.5),
			p99Ms: percentile(sorted, 0.99),
			maxMs: sorted[sorted.length - 1] ?? 0,
			score: this.ticks + 50 * this.kills - 500 * (baseAlive ? 0 : 1),
		}
	}

	dispose() {
		Math.random = this.originalRandom
	}

	private tick(count: boolean) {
		const game = this.game
		const p2 = game.p2!
		const started = performance.now()
		const p1Lives = game.p1.lives
		const nearP1 = game.bullets
			.filter(
				(bullet) =>
					Math.abs(bullet.coordinateX - game.p1.coordinateX) <= 12 &&
					Math.abs(bullet.coordinateY - game.p1.coordinateY) <= 12
			)
			.map((bullet) => isEnemy(bullet.shooter))

		gameFrame(game)
		this.times.push(performance.now() - started)
		if (!count) return

		this.ticks++
		if (game.level !== this.lastLevel) {
			this.seen.clear()
			this.lastLevel = game.level
		}
		for (const enemy of game.enemies) this.seen.add(enemy.id)
		for (const id of [...this.seen]) {
			if (!game.enemies.some((enemy) => enemy.id === id)) {
				this.seen.delete(id)
				this.kills++
			}
		}
		if (getAiMemory(game)?.goal?.kind === 'defend') this.defendTicks++
		this.positions.push({ x: p2.coordinateX, y: p2.coordinateY })
		if (this.positions.length > PROGRESS_WINDOW) this.positions.shift()
		// a limit cycle moves a pixel per tick and still goes nowhere
		if (
			this.positions.length >= PROGRESS_WINDOW &&
			wedgedInWindow(this.positions, p2.coordinateX, p2.coordinateY)
		)
			this.stuckTicks++
		if (
			game.p1.lives < p1Lives &&
			nearP1.includes(false) &&
			!nearP1.includes(true)
		)
			this.friendlyFire++
	}
}
