import { GameSettings, TypeSimpleSound, TypeSound } from '@/engine'
import { createAudioElement, getKeys } from '@/utils'
import { useEffect, useRef, useState } from 'react'

type PrevSound = null | 'player' | 'enemy'

const activeSounds: Record<TypeSimpleSound, boolean> = {
	level_start: false,
	game_over: false,
	pause: false,
	bang: false,
	bonus_pickup: false,
	bonus_spawn: false,
	flag_bang: false,
	heavy_hit: false,
	hit_1: false,
	shoot: false,
}

export const useAudio = (
	sounds: Record<TypeSound, boolean>,
	settings: GameSettings,
	isPlayerMoving: boolean,
	isEnemyMoving: boolean
) => {
	const [soundPrev, setSoundPrev] = useState<PrevSound>(null)
	const playerMoveSound = useRef<HTMLAudioElement | null>(null)
	const enemyMoveSound = useRef<HTMLAudioElement | null>(null)
	const marioThemeSound = useRef<HTMLAudioElement | null>(null)

	// Settings up the sound
	useEffect(() => {
		if (!settings) return

		playerMoveSound.current = createAudioElement(
			`${import.meta.env.BASE_URL}audio/${settings.soundPack}/player_move.ogg`,
			0.06
		)
		enemyMoveSound.current = createAudioElement(
			`${import.meta.env.BASE_URL}audio/${settings.soundPack}/enemy_move.ogg`,
			0.06
		)
		marioThemeSound.current = createAudioElement(
			`${import.meta.env.BASE_URL}audio/mario/theme.ogg`,
			0.1
		)

		return () => {
			playerMoveSound.current?.pause()
			enemyMoveSound.current?.pause()
			marioThemeSound.current?.pause()
		}
	}, [])

	useEffect(() => {
		if (!settings) return

		const playSound = (sound: PrevSound) => {
			if (soundPrev !== sound) {
				setSoundPrev(sound)
				if (settings.soundPack === 'mario') {
					marioThemeSound.current?.play()
				} else {
					if (sound === 'player') {
						playerMoveSound.current?.play()
						enemyMoveSound.current?.pause()
					} else if (sound === 'enemy') {
						enemyMoveSound.current?.play()
						playerMoveSound.current?.pause()
					} else {
						playerMoveSound.current?.pause()
						enemyMoveSound.current?.pause()
					}
				}
			}
		}

		if (isPlayerMoving) {
			playSound('player')
		} else if (isEnemyMoving) {
			playSound('enemy')
		} else {
			playSound(null)
		}
	}, [isPlayerMoving, isEnemyMoving, settings, soundPrev])

	const titles = getKeys(sounds)

	for (let i = 0; i < titles.length; i++) {
		const sound = titles[i]
		if (sounds[titles[i]]) {
			if (
				sound !== 'player_move' &&
				sound !== 'enemy_move' &&
				!activeSounds[sound]
			) {
				activeSounds[sound] = true
				setTimeout(() => (activeSounds[sound] = false), 50)
				const audio = new Audio(
					`${import.meta.env.BASE_URL}audio/${settings.soundPack}/${sound}.ogg`
				)
				audio.volume = 0.5
				audio.play()
			}
		}
	}
}
