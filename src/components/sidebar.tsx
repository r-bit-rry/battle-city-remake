import { AI_TIER_LABELS, Game } from '@/engine'
import { player_icon, stage_icon, tank_icon } from '@/models'
import { RenderObject } from './render-object'

interface SidebarProps {
	game: Game
}

export const Sidebar = (props: SidebarProps) => {
	const { enemyList, p1, p2, level, aiLevel } = props.game

	return (
		<div className="sidebar">
			<div className="tank_container">
				{enemyList.map((e, i) => (
					<div key={i} className="tank_icon_wrapper">
						{tank_icon.map((row, i) => (
							<RenderObject key={e.type + i} i={i} row={row} />
						))}
					</div>
				))}
			</div>
			<div className="p1_container">
				<p className="sidebar_text">1P</p>
				<div className="p_num_wrapper">
					<div>
						{player_icon.map((row, i) => (
							<RenderObject key={'1' + i} i={i} row={row} />
						))}
					</div>
					<p className="sidebar_text">{p1.lives}</p>
				</div>
			</div>
			{p2 && (
				<div className="p2_container">
					<p className="sidebar_text">
						{aiLevel
							? `AI ${(props.game.aiRole ?? 'wingman')[0].toUpperCase()}${AI_TIER_LABELS[aiLevel]}`
							: '2P'}
					</p>
					<div className="p_num_wrapper">
						<div>
							{player_icon.map((row, i) => (
								<RenderObject key={'1' + i} i={i} row={row} />
							))}
						</div>
						<p className="sidebar_text">{p2.lives}</p>
					</div>
				</div>
			)}
			{
				<div className="stage_wrapper">
					{stage_icon.map((row, i) => (
						<RenderObject key={'1' + i} i={i} row={row} />
					))}
					<p className="sidebar_text sidebar_text_stage_num">
						{level}
					</p>
				</div>
			}
		</div>
	)
}
