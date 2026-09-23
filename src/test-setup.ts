import { vi } from 'vitest'

if (typeof window !== 'undefined') {
	window.HTMLMediaElement.prototype.play = vi
		.fn()
		.mockResolvedValue(
			undefined
		) as unknown as typeof window.HTMLMediaElement.prototype.play

	if (!window.requestAnimationFrame) {
		window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
			setTimeout(
				() => callback(performance.now()),
				16
			)) as unknown as typeof window.requestAnimationFrame
	}
}
