import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameProvider } from '@/components/game-provider'
import { Menu } from './menu'

const ROW_HEIGHT = 40
const ROW_TOP = 100
const WRAPPER_HEIGHT = 1000

const setDesktopViewport = () => {
	Object.defineProperty(window, 'innerWidth', {
		configurable: true,
		value: 1200,
	})
	Object.defineProperty(window, 'innerHeight', {
		configurable: true,
		value: 1000,
	})
}

const makeRect = (top: number, height: number) =>
	({
		top,
		height,
		bottom: top + height,
		left: 0,
		right: 0,
		width: 0,
		x: 0,
		y: top,
		toJSON: () => ({}),
	}) as DOMRect

const mockLayout = () => {
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
		function (this: HTMLElement) {
			const row = this.getAttribute('data-menu-row')
			if (row)
				return makeRect(
					ROW_TOP + (Number(row) - 1) * ROW_HEIGHT,
					ROW_HEIGHT
				)

			if (this.getAttribute('data-testid') === 'menu-wrapper')
				return makeRect(0, WRAPPER_HEIGHT)

			return makeRect(0, 0)
		}
	)
}

const renderMenu = () => {
	render(
		<GameProvider>
			<Menu />
		</GameProvider>
	)

	const rows = () => Array.from(document.querySelectorAll('[data-menu-row]'))
	const cursor = () =>
		document.querySelector('[data-testid="menu-cursor"]') as HTMLElement
	const press = (code: string) => fireEvent.keyPress(document, { code })
	const cursorTop = () => parseFloat(cursor().style.top)
	const rowCenter = (index: number) =>
		ROW_TOP + (index - 1) * ROW_HEIGHT + ROW_HEIGHT / 2

	return { rows, cursor, press, cursorTop, rowCenter }
}

describe('menu cursor alignment', () => {
	beforeEach(() => {
		setDesktopViewport()
		mockLayout()
	})
	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it('keeps the original fixed x offset', () => {
		const { cursor } = renderMenu()

		expect(cursor().style.left).toBe(`${(54 - 7) * 4.5}px`)
	})

	it('centers the cursor on the selected main menu row', () => {
		const { rows, cursorTop, rowCenter, press } = renderMenu()

		expect(rows()).toHaveLength(5)
		expect(cursorTop()).toBe(rowCenter(1))

		press('KeyS')
		expect(cursorTop()).toBe(rowCenter(2))

		press('KeyW')
		expect(cursorTop()).toBe(rowCenter(1))

		press('KeyW')
		expect(cursorTop()).toBe(rowCenter(5))
	})

	it('centers the cursor on all eight settings rows', () => {
		const { rows, cursorTop, rowCenter, press } = renderMenu()

		for (let i = 0; i < 4; i++) press('KeyS')
		press('Enter')

		expect(rows()).toHaveLength(8)
		expect(cursorTop()).toBe(rowCenter(1))

		for (let i = 0; i < 7; i++) press('KeyS')
		expect(cursorTop()).toBe(rowCenter(8))

		press('KeyS')
		expect(cursorTop()).toBe(rowCenter(1))
	})

	it('shows numeric AI levels and AUTO RESPAWN in settings', () => {
		const { press } = renderMenu()

		for (let i = 0; i < 4; i++) press('KeyS')
		press('Enter')

		expect(document.body.textContent).toContain('AI LEVEL (0)')
		expect(document.body.textContent).toContain('AUTO RESPAWN')

		for (let i = 0; i < 3; i++) press('KeyS')
		press('Enter')

		expect(document.body.textContent).toContain('AI LEVEL (1)')

		press('Enter')
		press('Enter')
		expect(document.body.textContent).toContain('AI LEVEL (3)')

		press('Enter')
		expect(document.body.textContent).toContain('AI LEVEL (0)')
	})

	it('shows and cycles the AI role in settings', () => {
		const { press } = renderMenu()

		for (let i = 0; i < 4; i++) press('KeyS')
		press('Enter')

		expect(document.body.textContent).toContain('AI ROLE (WINGMAN)')

		for (let i = 0; i < 4; i++) press('KeyS')
		press('Enter')

		expect(document.body.textContent).toContain('AI ROLE (HUNTER)')
	})
})
