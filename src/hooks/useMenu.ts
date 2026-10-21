import { AI_TIER_LABELS, GameSettings, TypeAiLevel, TypeAiRole } from '@/engine'
import { TypePlayerLevel } from '@/types'
import { useCallback, useEffect, useState } from 'react'
import { useGame } from './useGame'
import { getRandomInt } from '@/utils'
import { useMobile } from './useMobile'

type MenuState =
	| 'main'
	| '1 player'
	| '2 players'
	| 'multiplayer'
	| 'settings'
	| 'create lobby'
	| 'join lobby'
	| 'lobby'
	| 'find lobby'

const AI_LEVELS: TypeAiLevel[] = ['beginner', 'intermediate', 'pro', 'elite']
const AI_ROLES: TypeAiRole[] = ['guardian', 'wingman', 'hunter']

const menuStates = (
	gameSettings: GameSettings,
	lobbyId: string,
	searchingLobbyId: string,
	aiLevel: TypeAiLevel,
	aiRole: TypeAiRole
) => ({
	main: ['1 PLAYER', '1 PLAYER + AI', '2 PLAYERS', 'MULTIPLAYER', 'SETTINGS'],
	'1 player': ['PLAY', 'CONSTRUCTION', 'BACK'],
	'2 players': ['PLAY', 'CONSTRUCTION', 'BACK'],
	multiplayer: ['CREATE LOBBY', 'FIND LOBBY', 'BACK'],
	'create lobby': [`ID:  ${lobbyId}`, 'CREATE', 'CONSTRUCTION', 'BACK'],
	'find lobby': [`ID: ${searchingLobbyId}`, 'FIND LOBBY', 'BACK'],
	'join lobby': ['WAITING'],
	lobby: [`ID: ${lobbyId}`, '(WAIT FOR P2)', 'BACK'],
	settings: [
		`SOUND (${gameSettings.soundPack})`,
		`FRIENDLY FIRE (${gameSettings.friendlyFire ? 'y' : 'n'})`,
		`PLAYER LEVEL (${gameSettings.playerLevel})`,
		`AI LEVEL (${AI_TIER_LABELS[aiLevel]})`,
		`AI ROLE (${aiRole.toUpperCase()})`,
		`AUTO RESPAWN (${gameSettings.survivorRespawn ? 'y' : 'n'})`,
		`HARDCORE (${gameSettings.hardcore ? 'y' : 'n'})`,
		`BACK`,
	],
})

export const useMenu = () => {
	const { startLocalGame, createLobby, joinLobby } = useGame()
	const isMobile = useMobile()

	const [isEditing, setEditing] = useState(false)
	const [choose, setChoose] = useState(1)
	const [range, setRange] = useState(5)
	const [state, setState] = useState<MenuState>('main')

	// Game Settings
	const [soundPack, setSoundPack] = useState<'default' | 'mario'>('default')
	const [hardcore, setHardcore] = useState(false)
	const [friendlyFire, setFriendlyFire] = useState(false)
	const [playerLevel, setPlayerLevel] = useState<TypePlayerLevel>(0)
	const [aiLevel, setAiLevel] = useState<TypeAiLevel>('beginner')
	const [aiRole, setAiRole] = useState<TypeAiRole>('wingman')
	const [survivorRespawn, setSurvivorRespawn] = useState(true)

	// Lobbying
	const [lobbyId, setLobbyId] = useState('1000')
	const [searchingLobbyId, setSearchingLobbyId] = useState('')

	const getMenuStates = () =>
		menuStates(gameSettings, lobbyId, searchingLobbyId, aiLevel, aiRole)

	const playMenuSound = useCallback(() => {
		const sound = new Audio(
			`${import.meta.env.BASE_URL}audio/${soundPack}/menu.ogg`
		)
		sound.volume = 0.3
		sound.play()
	}, [soundPack])

	const playChooseSound = useCallback(() => {
		const sound = new Audio(
			`${import.meta.env.BASE_URL}audio/${soundPack}/shoot.ogg`
		)
		sound.volume = 0.3
		sound.play()
	}, [soundPack])

	const gameSettings: GameSettings = {
		friendlyFire,
		hardcore,
		playerLevel,
		survivorRespawn,
		soundPack,
	}

	const settings: GameSettings = {
		hardcore,
		playerLevel,
		friendlyFire,
		survivorRespawn,
		soundPack,
	}

	const updateState = (newState: MenuState) => {
		setRange(getMenuStates()[newState].length)
		setState(newState)
		setChoose(1)
		playChooseSound()
	}

	const setChooseHandler = useCallback(
		(action: '+' | '-') => {
			setChoose((prev) => {
				if (action === '+') {
					return prev + 1 > range ? 1 : prev + 1
				} else {
					return prev - 1 === 0 ? range : prev - 1
				}
			})
			playMenuSound()
		},
		[range, soundPack]
	)

	const cycleAiLevel = (action: '+' | '-') => {
		setAiLevel((prev) => {
			const index = AI_LEVELS.indexOf(prev)
			const next =
				action === '+'
					? (index + 1) % AI_LEVELS.length
					: (index - 1 + AI_LEVELS.length) % AI_LEVELS.length
			return AI_LEVELS[next]
		})
		playChooseSound()
	}

	const cycleAiRole = (action: '+' | '-') => {
		setAiRole((prev) => {
			const index = AI_ROLES.indexOf(prev)
			const next =
				action === '+'
					? (index + 1) % AI_ROLES.length
					: (index - 1 + AI_ROLES.length) % AI_ROLES.length
			return AI_ROLES[next]
		})
		playChooseSound()
	}

	useEffect(() => {
		const chooseHandler = (code: string) => {
			if (isEditing) return

			if (code === 'KeyW') {
				setChooseHandler('-')
			}

			if (code === 'KeyS') {
				setChooseHandler('+')
			}

			if (code === 'Enter' || code === 'KeyF' || code === 'Space') {
				switch (state) {
					case 'main':
						switch (choose) {
							case 1:
								updateState('1 player')
								break
							case 2:
								startLocalGame(
									2,
									settings,
									undefined,
									aiLevel,
									aiRole
								)
								break
							case 3:
								updateState('2 players')
								break
							case 4:
								updateState('multiplayer')
								break
							case 5:
								updateState('settings')
								break
						}
						break
					case '1 player':
						switch (choose) {
							case 1:
								startLocalGame(1, settings)
								break
							case 2:
								setEditing(true)
								break
							case 3:
								updateState('main')
								break
						}
						break
					case '2 players':
						switch (choose) {
							case 1:
								startLocalGame(2, settings)
								break
							case 2:
								setEditing(true)
								break
							case 3:
								updateState('main')
								break
						}
						break
					case 'settings':
						switch (choose) {
							case 1:
								setSoundPack((prev) =>
									prev === 'default' ? 'mario' : 'default'
								)
								break
							case 2:
								setFriendlyFire((prev) => !prev)
								break
							case 3:
								setPlayerLevel((prev) =>
									prev === 3
										? 0
										: ((prev + 1) as TypePlayerLevel)
								)
								break
							case 4:
								cycleAiLevel('+')
								break
							case 5:
								cycleAiRole('+')
								break
							case 6:
								setSurvivorRespawn((prev) => !prev)
								break
							case 7:
								setHardcore((prev) => !prev)
								break
							case 8:
								updateState('main')
								break
						}
						break
					case 'multiplayer':
						switch (choose) {
							case 1:
								updateState('create lobby')
								setLobbyId(String(getRandomInt(1000, 9999)))
								break
							case 2:
								updateState('find lobby')
								break
							case 3:
								updateState('main')
								break
						}
						break
					case 'create lobby':
						switch (choose) {
							case 2:
								updateState('lobby')
								createLobby(lobbyId, settings)
								break
							case 3:
								setEditing(true)
								break
							case 4:
								updateState('multiplayer')
								break
						}
						break
					case 'lobby':
						switch (choose) {
							case 3:
								updateState('multiplayer')
								break
						}
						break
					case 'find lobby':
						switch (choose) {
							case 1:
								setSearchingLobbyId(prompt()?.slice(0, 4) ?? '')
								break
							case 2:
								if (!searchingLobbyId) break

								joinLobby(searchingLobbyId)
								break
							case 3:
								updateState('multiplayer')
								setSearchingLobbyId('')
								break
						}
						break
				}
			}
		}

		const chooseHandlerListener = (e: KeyboardEvent) => {
			chooseHandler(e.code)
		}

		const mobileHandlers = [
			{
				id: 'top1',
				event: 'click',
				handler: () => setChooseHandler('-'),
			},
			{
				id: 'bottom1',
				event: 'click',
				handler: () => setChooseHandler('+'),
			},
			{
				id: 'fire1',
				event: 'click',
				handler: () => chooseHandler('Enter'),
			},
		]

		if (isMobile) {
			mobileHandlers.forEach(({ id, event, handler }) => {
				document.getElementById(id)?.addEventListener(event, handler)
			})
			return () => {
				mobileHandlers.forEach(({ id, event, handler }) => {
					document
						.getElementById(id)
						?.removeEventListener(event, handler)
				})
			}
		}

		document.addEventListener('keypress', chooseHandlerListener)

		return () => {
			document.removeEventListener('keypress', chooseHandlerListener)
		}
	}, [state, choose, soundPack, isEditing, aiLevel, aiRole, survivorRespawn])

	return {
		state: getMenuStates()[state],
		choose,
		isEditing,
		setEditing,
	}
}
