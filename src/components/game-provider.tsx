import {
	EditorObject,
	Game,
	GameSettings,
	TypeAiLevel,
	gameFrame,
} from '@/engine'
import { CreateGameObject } from '@/types'
import {
	Dispatch,
	ReactNode,
	SetStateAction,
	createContext,
	useEffect,
	useState,
} from 'react'
import { Controls } from './controls/controls'
import { gameApi } from '@/api'

interface GameContextInterface {
	game?: Game
	setGame: Dispatch<SetStateAction<Game | undefined>>
	editor: CreateGameObject[]
	setEditor: Dispatch<SetStateAction<CreateGameObject[]>>
	setEdited: () => void
	startLocalGame: (
		players: 1 | 2,
		settings: GameSettings,
		editor?: EditorObject[],
		aiLevel?: TypeAiLevel
	) => void
	createLobby: (lobbyId: string, settings: GameSettings) => void
	joinLobby: (lobbyId: string) => void
}

export const GameContext = createContext<GameContextInterface>({
	game: undefined,
	setGame: () => {},
	editor: [],
	setEditor: () => {},
	setEdited: () => {},
	startLocalGame: () => {},
	createLobby: () => {},
	joinLobby: () => false,
})

interface Props {
	children: ReactNode
}

export const GameProvider = ({ children }: Props) => {
	const [game, setGame] = useState<Game>()
	const [editor, setEditor] = useState<CreateGameObject[]>([])
	const [isEdited, setEdited] = useState(false)

	const startLocalGame = (
		players: 1 | 2,
		settings: GameSettings,
		_editor?: EditorObject[],
		aiLevel?: TypeAiLevel
	) => {
		const newGame = new Game(
			'local',
			'p1',
			players === 2 ? 'p2' : null,
			settings,
			isEdited ? editor : undefined,
			aiLevel
		)

		setGame(newGame)
		setEdited(false)
	}

	const createLobby = (lobbyId: string, settings: GameSettings) => {
		gameApi.createLobby(lobbyId, setGame, settings)
	}

	const joinLobby = (lobbyId: string) => {
		gameApi.joinLobby(lobbyId, setGame)
	}

	useEffect(() => {
		const gameLoop = () => {
			try {
				if (!game) return

				const startTime = new Date().getTime()
				gameFrame(game)

				if (game.isEnded) {
					setGame(undefined)
				} else {
					setTimeout(
						() => gameLoop(),
						22 - (new Date().getTime() - startTime)
					)
				}
			} catch (error) {
				alert('Game crashed :(')
				console.error('Error during game frame:', error)
				setGame(undefined)
			}
		}

		if (game?.id === 'local') gameLoop()
	}, [game])

	return (
		<GameContext.Provider
			value={{
				game,
				setGame,
				editor,
				setEditor,
				startLocalGame,
				setEdited: () => setEdited(true),
				createLobby,
				joinLobby,
			}}
		>
			<Controls />
			{children}
		</GameContext.Provider>
	)
}
