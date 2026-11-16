/**
 * Regenerates the PWA / home-screen icons in static/icons from the logo tick.
 * Run with `bun scripts/make-icons.ts` after changing the logo.
 */
import sharp from 'sharp';

const PAPER = '#fafaf8';
const GOLD = '#C9A24A';
const TICK = 'M4 13c2 1.5 3.5 3.5 4.5 5.5C11 12 15 7 21 3';

/** The gold tick on paper. `inset` is the share of the canvas kept clear on each side. */
function svg(size: number, inset: number, rounded: boolean): string {
	const box = size * (1 - inset * 2);
	const scale = box / 24;
	const offset = size * inset;
	const radius = rounded ? size * 0.22 : 0;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
	<rect width="${size}" height="${size}" rx="${radius}" fill="${PAPER}"/>
	<g transform="translate(${offset} ${offset}) scale(${scale})">
		<path d="${TICK}" fill="none" stroke="${GOLD}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
	</g>
</svg>`;
}

const icons: { file: string; size: number; inset: number; rounded: boolean }[] = [
	{ file: 'icon-192.png', size: 192, inset: 0.16, rounded: true },
	{ file: 'icon-512.png', size: 512, inset: 0.16, rounded: true },
	// Maskable icons are cropped to a circle or squircle: keep the tick in the middle 60%.
	{ file: 'icon-maskable-512.png', size: 512, inset: 0.24, rounded: false },
	// iOS rounds the corners itself.
	{ file: 'apple-touch-icon.png', size: 180, inset: 0.18, rounded: false }
];

for (const i of icons) {
	await sharp(Buffer.from(svg(i.size, i.inset, i.rounded))).png().toFile(`static/icons/${i.file}`);
	console.log(`static/icons/${i.file}`);
}
