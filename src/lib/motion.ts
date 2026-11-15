/**
 * Motion helpers. Svelte transitions run through the Web Animations API, so the global
 * `prefers-reduced-motion` CSS rule doesn't reach them — every transition here checks it.
 */
import { cubicOut, quintOut } from 'svelte/easing';
import {
	draw as svelteDraw,
	fly as svelteFly,
	scale as svelteScale,
	slide as svelteSlide,
	type DrawParams,
	type FlyParams,
	type ScaleParams,
	type SlideParams,
	type TransitionConfig
} from 'svelte/transition';
import { flip as svelteFlip, type FlipParams } from 'svelte/animate';

export function reducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const still = (): TransitionConfig => ({ duration: 0 });

/** Ink being written left to right: a clip-path reveal. */
export function writeIn(_node: Element, { delay = 0, duration = 450 } = {}): TransitionConfig {
	if (reducedMotion()) return still();
	return {
		delay,
		duration,
		easing: cubicOut,
		css: (t) => `clip-path: inset(-20% ${(1 - t) * 100}% -20% 0)`
	};
}

export const draw = (node: SVGElement & { getTotalLength(): number }, p: DrawParams = {}) =>
	reducedMotion() ? still() : svelteDraw(node, { duration: 350, easing: cubicOut, ...p });

export const fly = (node: Element, p: FlyParams = {}) =>
	reducedMotion() ? still() : svelteFly(node, { y: -6, duration: 160, easing: cubicOut, ...p });

export const pop = (node: Element, p: ScaleParams = {}) =>
	reducedMotion() ? still() : svelteScale(node, { start: 0.85, duration: 180, easing: quintOut, ...p });

export const slide = (node: Element, p: SlideParams = {}) =>
	reducedMotion() ? still() : svelteSlide(node, { duration: 220, easing: cubicOut, ...p });

export const flip = (node: Element, fromTo: { from: DOMRect; to: DOMRect }, p: FlipParams = {}) =>
	reducedMotion() ? { duration: 0 } : svelteFlip(node, fromTo, { duration: 220, easing: cubicOut, ...p });
