import {
	Controls,
	EditorObject,
	EnemyList,
	GameSettings,
	TypeAiLevel,
	TypeAiRole,
	TypeEnemySpawnPosition,
	TypeSound,
} from '../types'
import { generateBonuses } from '../utils'
import { getHardcoreList, maps as mapsBlank } from '../maps'
import { Map } from '../types'
import { EditorMap } from '../maps'
import { Bang, Bonus, Bullet, GameObject, Player, Tank } from '.'

export class Game {
	id: string

	// Flags
	isPaused = false
	isFlagAlive = true
	isEnded = false
	sounds: Record<TypeSound, boolean> = {
		heavy_hit: false,
		pause: false,
		level_start: false,
		bang: false,
		flag_bang: false,
		game_over: false,
		shoot: false,
		hit_1: false,
		bonus_spawn: false,
		bonus_pickup: false,
		player_move: false,
		enemy_move: false,
	}

	// Players
	p1: Player
	p1Controls: Controls = { fire: false, move: null, pause: false }

	p2: Player | null
	p2Controls: Controls = { fire: false, move: null, pause: false }

	// Enemies
	enemies: Tank[] = []
	enemyList: EnemyList[] = []
	enemySpawnPosition: TypeEnemySpawnPosition = 'middle'

	// Objects
	objects: GameObject[] = []
	bullets: Bullet[] = []
	bonuses: Bonus[] = []
	bangs: Bang[] = []

	// Counters
	frame = 0
	enemySpawnCooldown = 0
	timerBonus = 0
	gameOverAnimation = 0
	levelEndDelay = 0
	levelChangeAnimation = 110
	level = 1

	// Settings
	editor?: EditorObject[]
	settings: GameSettings
	aiLevel?: TypeAiLevel
	aiRole?: TypeAiRole

	constructor(
		id: string,
		p1: string,
		p2: string | null,
		settings: GameSettings,
		editor?: EditorObject[],
		aiLevel?: TypeAiLevel,
		aiRole?: TypeAiRole
	) {
		this.id = id
		this.settings = settings
		this.aiLevel = aiLevel
		this.aiRole = aiRole

		this.p1 = new Player(
			'left',
			p1,
			this.settings.playerLevel,
			this.settings.hardcore
		)

		if (p2) {
			this.p2 = new Player(
				'right',
				p2,
				this.settings.playerLevel,
				this.settings.hardcore
			)
		} else {
			this.p2 = null
		}

		this.editor = editor
	}

	resetSounds() {
		this.sounds = {
			heavy_hit: false,
			pause: false,
			level_start: false,
			bang: false,
			flag_bang: false,
			game_over: false,
			shoot: false,
			hit_1: false,
			bonus_spawn: false,
			bonus_pickup: false,
			player_move: false,
			enemy_move: false,
		}
	}

	pause(controller: Controls) {
		if (controller.pause) {
			if (!this.isPaused) this.sounds.pause = true

			this.isPaused = !this.isPaused
			controller.pause = false
		}
	}

	nextLevel() {
		// Game has 10 levels
		if (this.level === 11) {
			this.isEnded = true
			return
		}

		// Setting up new level
		let map: Map
		if (this.editor) {
			map = EditorMap(this.editor)
			this.editor = undefined
		} else {
			const maps = JSON.parse(JSON.stringify(mapsBlank))
			map = maps['map' + this.level]
		}

		this.resetBetweenLevels(map)
	}

	resetBetweenLevels(map: Map) {
		this.objects = map.objects

		this.bonuses = []
		this.bullets = []
		this.bangs = []
		this.enemies = []
		this.enemySpawnCooldown = 0
		this.enemySpawnPosition = 'middle'
		this.timerBonus = 0
		this.sounds.level_start = true

		const p1HasLives = this.p1.lives > 0
		const p2HasLives = this.p2 ? this.p2.lives > 0 : false

		if (this.settings.survivorRespawn) {
			if (!p1HasLives && p2HasLives) this.p1.lives = 1
			if (this.p2 && !p2HasLives && p1HasLives) this.p2.lives = 1
		}

		this.p1.reset()
		if (this.p2) this.p2.reset()

		this.enemyList = generateBonuses(
			this.settings.hardcore ? getHardcoreList() : map.enemyList
		)
	}

	spawnEnemy(position: TypeEnemySpawnPosition) {
		this.enemySpawnCooldown = 100
		this.enemySpawnPosition =
			position === 'middle'
				? 'right'
				: position === 'right'
					? 'left'
					: 'middle'

		const newTank = this.enemyList.shift()
		if (newTank) {
			this.enemies.push(
				new Tank(position, newTank.type, undefined, newTank.bonus)
			)
		}
	}
}
