import { Game } from '@/engine'
import { TypeButton, TypeMoveButton } from '@/types'
import { MutableRefObject, useCallback, useEffect, useRef } from 'react'
import { useFrameLoop } from './useFrameLoop'
import { useMobile } from './useMobile'
import { TypeDirection } from '@/engine'

const p1MovementMap: Record<string, TypeMoveButton> = {
	KeyW: 'TOP',
	ArrowUp: 'TOP',
	KeyD: 'RIGHT',
	ArrowRight: 'RIGHT',
	KeyA: 'LEFT',
	ArrowLeft: 'LEFT',
	KeyS: 'BOTTOM',
	ArrowDown: 'BOTTOM',
}

const p2MovementMap: Record<string, TypeMoveButton> = {
	KeyU: 'TOP',
	KeyK: 'RIGHT',
	KeyH: 'LEFT',
	KeyJ: 'BOTTOM',
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

export const useControls = (game?: Game) => {
	const isMobile = useMobile()

	const held1 = useRef<TypeMoveButton[]>([])
	const held2 = useRef<TypeMoveButton[]>([])

	const inputHandler = useCallback(
		(button: TypeButton | null, p: 1 | 2) => {
			if (!game || !button) return

			const controls = p === 1 ? game.p1Controls : game.p2Controls

			if (
				button === 'TOP' ||
				button === 'RIGHT' ||
				button === 'LEFT' ||
				button === 'BOTTOM'
			) {
				controls.move = button as TypeDirection
			} else if (button === 'FIRE') controls.fire = true
			else if (button === 'PAUSE') controls.pause = true
		},
		[game]
	)

	useFrameLoop(() => {
		const move1 = activeDirection(held1)
		const move2 = activeDirection(held2)

		if (move1) inputHandler(move1, 1)
		if (move2) inputHandler(move2, 2)
	})

	useEffect(() => {
		if (!game) return

		const moveHandler = (e: KeyboardEvent) => {
			const p1Direction = p1MovementMap[e.code]
			const p2Direction = p2MovementMap[e.code]

			if (p1Direction) {
				e.preventDefault()
				if (!e.repeat) pushHeld(held1, p1Direction)
			} else if (p2Direction) {
				e.preventDefault()
				if (!e.repeat) pushHeld(held2, p2Direction)
			}
		}

		const clearMovement = (e: KeyboardEvent) => {
			if (p1MovementMap[e.code]) removeHeld(held1, p1MovementMap[e.code])
			else if (p2MovementMap[e.code])
				removeHeld(held2, p2MovementMap[e.code])
		}

		const clearAllMovement = () => {
			held1.current = []
			held2.current = []
		}

		const fireHandler = (e: KeyboardEvent) => {
			if (e.code === 'KeyF') inputHandler('FIRE', 1)
			else if (e.code === 'KeyL') inputHandler('FIRE', 2)
		}

		const pauseHandler = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				e.preventDefault()
				if (!e.repeat) inputHandler('PAUSE', 1)
			}
		}

		const mobileHandlers = [
			{
				id: 'space',
				event: 'click',
				handler: () => inputHandler('PAUSE', 1),
			},

			{
				id: 'fire1',
				event: 'click',
				handler: () => inputHandler('FIRE', 1),
			},
			{
				id: 'fire2',
				event: 'click',
				handler: () => inputHandler('FIRE', 2),
			},

			{
				id: 'top1',
				event: 'touchstart',
				handler: () => pushHeld(held1, 'TOP'),
			},
			{
				id: 'bottom1',
				event: 'touchstart',
				handler: () => pushHeld(held1, 'BOTTOM'),
			},
			{
				id: 'left1',
				event: 'touchstart',
				handler: () => pushHeld(held1, 'LEFT'),
			},
			{
				id: 'right1',
				event: 'touchstart',
				handler: () => pushHeld(held1, 'RIGHT'),
			},

			{
				id: 'top2',
				event: 'touchstart',
				handler: () => pushHeld(held2, 'TOP'),
			},
			{
				id: 'bottom2',
				event: 'touchstart',
				handler: () => pushHeld(held2, 'BOTTOM'),
			},
			{
				id: 'left2',
				event: 'touchstart',
				handler: () => pushHeld(held2, 'LEFT'),
			},
			{
				id: 'right2',
				event: 'touchstart',
				handler: () => pushHeld(held2, 'RIGHT'),
			},

			{
				id: 'top1',
				event: 'touchend',
				handler: () => removeHeld(held1, 'TOP'),
			},
			{
				id: 'bottom1',
				event: 'touchend',
				handler: () => removeHeld(held1, 'BOTTOM'),
			},
			{
				id: 'left1',
				event: 'touchend',
				handler: () => removeHeld(held1, 'LEFT'),
			},
			{
				id: 'right1',
				event: 'touchend',
				handler: () => removeHeld(held1, 'RIGHT'),
			},

			{
				id: 'top2',
				event: 'touchend',
				handler: () => removeHeld(held2, 'TOP'),
			},
			{
				id: 'bottom2',
				event: 'touchend',
				handler: () => removeHeld(held2, 'BOTTOM'),
			},
			{
				id: 'left2',
				event: 'touchend',
				handler: () => removeHeld(held2, 'LEFT'),
			},
			{
				id: 'right2',
				event: 'touchend',
				handler: () => removeHeld(held2, 'RIGHT'),
			},

			{
				id: 'top1',
				event: 'touchcancel',
				handler: () => removeHeld(held1, 'TOP'),
			},
			{
				id: 'bottom1',
				event: 'touchcancel',
				handler: () => removeHeld(held1, 'BOTTOM'),
			},
			{
				id: 'left1',
				event: 'touchcancel',
				handler: () => removeHeld(held1, 'LEFT'),
			},
			{
				id: 'right1',
				event: 'touchcancel',
				handler: () => removeHeld(held1, 'RIGHT'),
			},

			{
				id: 'top2',
				event: 'touchcancel',
				handler: () => removeHeld(held2, 'TOP'),
			},
			{
				id: 'bottom2',
				event: 'touchcancel',
				handler: () => removeHeld(held2, 'BOTTOM'),
			},
			{
				id: 'left2',
				event: 'touchcancel',
				handler: () => removeHeld(held2, 'LEFT'),
			},
			{
				id: 'right2',
				event: 'touchcancel',
				handler: () => removeHeld(held2, 'RIGHT'),
			},
		]

		if (isMobile) {
			const timers = [
				setInterval(() => {
					const move = activeDirection(held1)
					if (move) inputHandler(move, 1)
				}, 10),
				setInterval(() => {
					const move = activeDirection(held2)
					if (move) inputHandler(move, 2)
				}, 10),
			]

			mobileHandlers.forEach(({ id, event, handler }) => {
				document.getElementById(id)?.addEventListener(event, handler)
			})

			return () => {
				timers.forEach(clearInterval)
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
