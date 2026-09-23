import { Bang, Game, Tank } from '../instances'
import { deleteBonus, mutationFilter } from '../utils'

export const bonusesFrameLogic = (game: Game) => {
	const { bonuses, p1, p2, enemies, timerBonus, sounds } = game

	if (timerBonus) game.timerBonus--

	for (let i = 0; i < bonuses.length; i++) {
		const bonus = bonuses[i]
		const { lifeTime, type, id } = bonus
		if (lifeTime === 0) {
			deleteBonus(id, bonuses)
			continue
		}
		const p = bonus.isAnyPlayerTouched(p1, p2)
		if (p && p.lives) {
			sounds.bonus_pickup = true
			switch (type) {
				case 'STAR':
					switch (p.type) {
						case 'LVL_0':
							p.type = 'LVL_1'
							break
						case 'LVL_1':
							p.type = 'LVL_2'
							p.availableBullets++
							break
						case 'LVL_2':
							p.type = 'LVL_3'
							p.availableBullets++
					}
					break
				case 'HP':
					if (!game.settings.hardcore && p.lives < 3) p.lives++
					break
				case 'GRENADE':
					mutationFilter(enemies, (e: Tank) => {
						if (e.spawnAnimation) {
							return true
						} else {
							game.bangs.push(
								new Bang('BIG', e.coordinateX, e.coordinateY)
							)
							return false
						}
					})
					break
				case 'HELMET':
					p.helmet = 200
					break
				case 'TIMER':
					game.timerBonus = 200
					break
			}
			deleteBonus(id, bonuses)
		} else {
			bonus.lifeTime--
		}
	}
}
