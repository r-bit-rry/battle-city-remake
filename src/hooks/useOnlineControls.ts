import { Game } from '@/engine'
import { TypeButton, TypeMoveButton } from '@/types'
import { MutableRefObject, useCallback, useEffect, useRef } from 'react'
import { useFrameLoop } from './useFrameLoop'
import { useMobile } from './useMobile'
import { gameApi } from '@/api'

const movementMap: Record<string, TypeMoveButton> = {
	KeyW: 'TOP',
	ArrowUp: 'TOP',
	KeyD: 'RIGHT',
	ArrowRight: 'RIGHT',
	KeyA: 'LEFT',
	ArrowLeft: 'LEFT',
	KeyS: 'BOTTOM',
	ArrowDown: 'BOTTOM',
}

const pushHeld = (
	held: MutableRefObject<TypeMoveButton[]>,
	direction: TypeMoveButton
) => {
	if (held.current.includes(direction)) return
	held.current.push(direction)
}

const removeHeld = (
	held: MutableRefObject<TypeMoveButton[]>,
	direction: TypeMoveButton
) => {
	held.current = held.current.filter((d) => d !== direction)
}

const activeDirection = (held: MutableRefObject<TypeMoveButton[]>) =>
	held.current[held.current.length - 1] ?? null

export const useOnlineControls = (game?: Game) => {
	const isMobile = useMobile()

	const held = useRef<TypeMoveButton[]>([])

	const inputHandler = useCallback(
		(button: TypeButton | null) => {
			if (!game || !button) return

			gameApi.input(button, game.id)
		},
		[game]
	)

	useFrameLoop(() => {
		const move = activeDirection(held)
		if (move) inputHandler(move)
	})

	useEffect(() => {
		if (!game) return

		const moveHandler = (e: KeyboardEvent) => {
			const direction = movementMap[e.code]
			if (!direction) return

			e.preventDefault()
			if (!e.repeat) pushHeld(held, direction)
		}

		const clearMovement = (e: KeyboardEvent) => {
			const direction = movementMap[e.code]
			if (direction) removeHeld(held, direction)
		}

		const clearAllMovement = () => {
			held.current = []
		}

		const fireHandler = (e: KeyboardEvent) => {
			if (e.code === 'KeyF') inputHandler('FIRE')
		}

		const pauseHandler = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				e.preventDefault()
				if (!e.repeat) inputHandler('PAUSE')
			}
		}

		const mobileHandlers = [
			{
				id: 'space',
				event: 'click',
				handler: () => inputHandler('PAUSE'),
			},

			{
				id: 'fire1',
				event: 'click',
				handler: () => inputHandler('FIRE'),
			},

			{
				id: 'top1',
				event: 'touchstart',
				handler: () => pushHeld(held, 'TOP'),
			},
			{
				id: 'bottom1',
				event: 'touchstart',
				handler: () => pushHeld(held, 'BOTTOM'),
			},
			{
				id: 'left1',
				event: 'touchstart',
				handler: () => pushHeld(held, 'LEFT'),
			},
			{
				id: 'right1',
				event: 'touchstart',
				handler: () => pushHeld(held, 'RIGHT'),
			},

			{
				id: 'top1',
				event: 'touchend',
				handler: () => removeHeld(held, 'TOP'),
			},
			{
				id: 'bottom1',
				event: 'touchend',
				handler: () => removeHeld(held, 'BOTTOM'),
			},
			{
				id: 'left1',
				event: 'touchend',
				handler: () => removeHeld(held, 'LEFT'),
			},
			{
				id: 'right1',
				event: 'touchend',
				handler: () => removeHeld(held, 'RIGHT'),
			},

			{
				id: 'top1',
				event: 'touchcancel',
				handler: () => removeHeld(held, 'TOP'),
			},
			{
				id: 'bottom1',
				event: 'touchcancel',
				handler: () => removeHeld(held, 'BOTTOM'),
			},
			{
				id: 'left1',
				event: 'touchcancel',
				handler: () => removeHeld(held, 'LEFT'),
			},
			{
				id: 'right1',
				event: 'touchcancel',
				handler: () => removeHeld(held, 'RIGHT'),
			},
		]

		if (isMobile) {
			const timer = setInterval(() => {
				const move = activeDirection(held)
				if (move) inputHandler(move)
			}, 10)

			mobileHandlers.forEach(({ id, event, handler }) => {
				document.getElementById(id)?.addEventListener(event, handler)
			})

			return () => {
				clearInterval(timer)
				clearAllMovement()
				mobileHandlers.forEach(({ id, event, handler }) => {
					document
						.getElementById(id)
						?.removeEventListener(event, handler)
				})
			}
		}

		document.addEventListener('keydown', moveHandler)
		document.addEventListener('keyup', clearMovement)
		document.addEventListener('keydown', fireHandler)
		document.addEventListener('keydown', pauseHandler)
		window.addEventListener('blur', clearAllMovement)

		return () => {
			clearAllMovement()
			document.removeEventListener('keydown', moveHandler)
			document.removeEventListener('keyup', clearMovement)
			document.removeEventListener('keydown', fireHandler)
			document.removeEventListener('keydown', pauseHandler)
			window.removeEventListener('blur', clearAllMovement)
		}
	}, [game, isMobile, inputHandler])
}
