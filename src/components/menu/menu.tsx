import { useMenu, useMobile, usePixel } from '@/hooks'
import { useLayoutEffect, useRef, useState } from 'react'
import s from './menu.module.css'
import { Cursor } from './cursor'
import { Editor } from '../editor/editor'

export const Menu = () => {
	const pixel = usePixel()
	const isMobile = useMobile()

	const { state, choose, isEditing, setEditing } = useMenu()

	const wrapperRef = useRef<HTMLDivElement>(null)
	const [cursorTop, setCursorTop] = useState<number | null>(null)

	useLayoutEffect(() => {
		const wrapper = wrapperRef.current
		const row = wrapper?.querySelector<HTMLElement>(
			`[data-menu-row="${choose}"]`
		)

		if (!wrapper || !row) {
			setCursorTop(null)
			return
		}

		const wrapperRect = wrapper.getBoundingClientRect()
		const rowRect = row.getBoundingClientRect()

		setCursorTop(
			rowRect.top -
				wrapperRect.top -
				wrapper.clientTop +
				rowRect.height / 2
		)
	}, [choose, state, pixel])

	if (isEditing) return <Editor close={() => setEditing(false)} />

	return (
		<div
			ref={wrapperRef}
			data-testid="menu-wrapper"
			className={s.menu_wrapper}
			style={{
				width: `${pixel * 13 * 16}px`,
				height: `${pixel * 13 * 16}px`,
			}}
		>
			<img
				className={s.background}
				src={`${import.meta.env.BASE_URL}img/main_menu.png`}
				alt="main_menu"
			/>
			<div className={s.buttons_wrapper}>
				{state.map((btn, i) => {
					return (
						<div
							key={btn}
							className={s.menu_row}
							data-menu-row={i + 1}
						>
							<p className={s.menu_text}>{btn}</p>
						</div>
					)
				})}
				{!isMobile && (
					<>
						<div className={s.p1_buttons}>
							<p className={s.buttons_text}>P1</p>
							<p className={s.buttons_text}>W A S D - MOVE</p>
							<p className={s.buttons_text}>F - FIRE</p>
							<p className={s.buttons_text}>SPACE - PAUSE</p>
						</div>
						<div className={s.p2_buttons}>
							<p className={s.buttons_text}>P2</p>
							<p className={s.buttons_text}>U H K J - MOVE</p>
							<p className={s.buttons_text}>L - FIRE</p>
							<p className={s.buttons_text}>SPACE - PAUSE</p>
						</div>
					</>
				)}
			</div>
			{cursorTop !== null && <Cursor top={cursorTop} pixel={pixel} />}
		</div>
	)
}
