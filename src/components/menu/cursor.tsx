import { tank_p1__lvl_0 } from '@/models'
import { getDirectionDegrees } from '@/utils'
import { RenderObject } from '../render-object'

interface Props {
	top: number
	pixel: number
}

export const Cursor = ({ top, pixel }: Props) => {
	return (
		<div
			data-testid="menu-cursor"
			style={{
				position: 'absolute',
				left: `${(54 - 7) * pixel}px`,
				top: `${top}px`,
				translate: '0 -50%',
				rotate: getDirectionDegrees('RIGHT'),
				scale: '0.7',
			}}
		>
			{tank_p1__lvl_0.t1.map((row, i) => (
				<RenderObject key={'1' + i} i={i} row={row} />
			))}
		</div>
	)
}
