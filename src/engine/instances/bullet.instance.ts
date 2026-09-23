import { v4 as uuid4 } from 'uuid'
import { TypeDirection, TypeTank } from '../types'
import { Coordinates } from './coordinates.instance'
import { isOneSpeedShooter } from '../utils'

export class Bullet extends Coordinates {
	id: string
	shooterId: string

	direction: TypeDirection
	shooter: TypeTank
	type: 'BULLET'

	// Applies on object distraction
	level: 1 | 2

	speed: 1 | 2 | 3

	constructor(
		x: number,
		y: number,
		direction: TypeDirection,
		shooter: TypeTank,
		shooterId: string
	) {
		switch (direction) {
			case 'TOP':
				y += 8
				break
			case 'BOTTOM':
				y -= 8
				break
			case 'LEFT':
				x -= 8
				break
			default:
				x += 8
		}

		super(x, y)

		this.id = uuid4()
		this.direction = direction
		this.shooter = shooter
		this.shooterId = shooterId
		this.type = 'BULLET'

		if (isOneSpeedShooter(shooter)) {
			this.speed = 1
		} else if (shooter === 'LVL_1') {
			this.speed = 2
		} else {
			this.speed = 3
		}
		if (shooter === 'LVL_3') {
			this.level = 2
		} else {
			this.level = 1
		}
	}
}
