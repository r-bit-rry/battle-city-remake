import { Bullet } from '.'
import {
	BusyCoordinates,
	TypeBonus,
	TypeDirection,
	TypeEnemySpawnPosition,
	TypeTank,
} from '../types'
import {
	generateNextRandomMoves,
	isEnemy,
	isImpassibleGameObject,
	isTank,
	isTankBlockedAt,
	random,
} from '../utils'
import { Coordinates } from './coordinates.instance'
import { v4 as uuid4 } from 'uuid'

export class Tank extends Coordinates {
	id: string
	direction: TypeDirection
	type: TypeTank
	bonus?: TypeBonus

	// Movement for enemies
	nextMoves?: {
		direction: TypeDirection
		repeat: number
	}

	// Characteristics
	tick: 1 | 2 = 1
	speed: 1 | 2
	availableBullets: 0 | 1 | 2 | 3
	lives: 0 | 1 | 2 | 3

	// Counters
	stuckCount = 0
	spawnAnimation = 50
	deathCooldown = 0

	constructor(
		side: TypeEnemySpawnPosition,
		type: TypeTank,
		id?: string,
		bonus?: TypeBonus,
		isHardcore?: boolean
	) {
		// Calculating coordinates
		let x: number
		const y = id ? 7 : 200

		if (id) x = side === 'left' ? 71 : 136
		else {
			side === 'left'
				? (x = 7)
				: side === 'middle'
					? (x = 103)
					: (x = 200)
		}

		super(x, y)

		// Generating id if tank is not a playerr
		this.id = id ?? uuid4()
		this.direction = id ? 'TOP' : 'BOTTOM'
		this.type = type
		this.speed = type === 'SPEEDY' ? 2 : 1
		this.lives = type === 'HEAVY' || (id && !isHardcore) ? 3 : 1
		this.bonus = bonus

		type === 'LVL_2'
			? (this.availableBullets = 2)
			: type === 'LVL_3'
				? (this.availableBullets = 3)
				: (this.availableBullets = 1)

		if (isEnemy(type)) this.generateNextMoves()
	}

	shoot(bullets: Bullet[]) {
		bullets.push(
			new Bullet(
				this.coordinateX,
				this.coordinateY,
				this.direction,
				this.type,
				this.id
			)
		)
		this.availableBullets--
	}

	// For bots
	generateNextMoves() {
		if (random(4)) {
			// Moving to the flag
			if (random(2)) {
				if (this.coordinateX > 103) {
					return (this.nextMoves = {
						repeat: Math.round((this.coordinateX - 103) * 0.4),
						direction: 'LEFT',
					})
				} else if (this.coordinateX < 103) {
					return (this.nextMoves = {
						repeat: Math.round((this.coordinateX - 103) * 0.4),
						direction: 'RIGHT',
					})
				}
			} else {
				if (this.coordinateY > 7) {
					return (this.nextMoves = {
						repeat: Math.round((this.coordinateY - 7) * 0.4),
						direction: 'BOTTOM',
					})
				}
			}
		}
		// Random Movement
		this.nextMoves = generateNextRandomMoves()
	}

	move(busyCoordinates: BusyCoordinates[]) {
		// Detect if tank is stuck
		let willMove = true

		switch (this.direction) {
			case 'TOP':
				for (let i = 0; i < busyCoordinates.length; i++) {
					const { coordinateX, coordinateY, type } =
						busyCoordinates[i]
					if (
						this.coordinateY >= 200 ||
						(isImpassibleGameObject(type) &&
							coordinateY === this.coordinateY + 8 &&
							coordinateX >= this.coordinateX - 14 &&
							coordinateX <= this.coordinateX + 7) ||
						(isTank(type) &&
							coordinateY === this.coordinateY + 15 &&
							coordinateX >= this.coordinateX - 14 &&
							coordinateX <= this.coordinateX + 14)
					) {
						willMove = false
						break
					}
				}
				if (willMove) this.coordinateY++
				break
			case 'BOTTOM':
				for (let i = 0; i < busyCoordinates.length; i++) {
					const { coordinateX, coordinateY, type } =
						busyCoordinates[i]
					if (
						this.coordinateY <= 7 ||
						(isImpassibleGameObject(type) &&
							coordinateY === this.coordinateY - 15 &&
							coordinateX >= this.coordinateX - 14 &&
							coordinateX + 7 <= this.coordinateX + 14) ||
						(isTank(type) &&
							coordinateY === this.coordinateY - 15 &&
							coordinateX >= this.coordinateX - 14 &&
							coordinateX <= this.coordinateX + 14)
					) {
						willMove = false
						break
					}
				}
				if (willMove) this.coordinateY--
				break
			case 'LEFT':
				for (let i = 0; i < busyCoordinates.length; i++) {
					const { coordinateX, coordinateY, type } =
						busyCoordinates[i]
					if (
						this.coordinateX <= 7 ||
						(isImpassibleGameObject(type) &&
							coordinateX === this.coordinateX - 15 &&
							coordinateY >= this.coordinateY - 14 &&
							coordinateY + 7 <= this.coordinateY + 14) ||
						(isTank(type) &&
							coordinateX === this.coordinateX - 15 &&
							coordinateY >= this.coordinateY - 14 &&
							coordinateY <= this.coordinateY + 14)
					) {
						willMove = false
						break
					}
				}
				if (willMove) this.coordinateX--
				break
			case 'RIGHT':
				for (let i = 0; i < busyCoordinates.length; i++) {
					const { coordinateX, coordinateY, type } =
						busyCoordinates[i]
					if (
						this.coordinateX >= 200 ||
						(isImpassibleGameObject(type) &&
							coordinateX === this.coordinateX + 8 &&
							coordinateY >= this.coordinateY - 14 &&
							coordinateY + 7 <= this.coordinateY + 14) ||
						(isTank(type) &&
							coordinateX === this.coordinateX + 15 &&
							coordinateY >= this.coordinateY - 14 &&
							coordinateY <= this.coordinateY + 14)
					) {
						willMove = false
						break
					}
				}
				if (willMove) this.coordinateX++
				break
		}

		// Tick for animation
		if (willMove) this.tick = this.tick === 1 ? 2 : 1
		else this.stuckCount++

		if (this.stuckCount === 3) {
			this.stuckCount = 0
			this.generateNextMoves()
		}
	}

	// Snaps the axis perpendicular to the facing direction to the nearest free
	// lane (coordinate % 8 === 0 or 7), so the 15px tank always fits 16px gaps.
	alignToGrid(busyCoordinates: BusyCoordinates[]) {
		const isVertical =
			this.direction === 'TOP' || this.direction === 'BOTTOM'
		const current = isVertical ? this.coordinateX : this.coordinateY
		const base = Math.floor(current / 8) * 8

		const candidates = [base, base + 7, base + 8].filter((candidate) => {
			const x = isVertical ? candidate : this.coordinateX
			const y = isVertical ? this.coordinateY : candidate
			return !isTankBlockedAt(this, x, y, busyCoordinates)
		})

		if (!candidates.length) return

		const target = candidates.reduce((a, b) =>
			Math.abs(a - current) <= Math.abs(b - current) ? a : b
		)

		if (target === current) return

		if (isVertical) this.coordinateX = target
		else this.coordinateY = target
	}
}
