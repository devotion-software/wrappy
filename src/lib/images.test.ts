import { describe, expect, it } from 'vitest';
import { imageUrl } from './images';

describe('imageUrl', () => {
	it('builds the served path for each variant', () => {
		expect(imageUrl('items/abc/def', 'thumb')).toBe('/img/items/abc/def-thumb.webp');
		expect(imageUrl('items/abc/def', 'large')).toBe('/img/items/abc/def-large.webp');
	});

	it('matches the key pattern the /img route accepts', () => {
		const id = 'A'.repeat(22);
		const url = imageUrl(`items/${id}/${id}`, 'thumb');
		expect(url.replace(/^\/img\//, '')).toMatch(/^items\/[0-9A-Za-z]{22}\/[0-9A-Za-z]{22}-(thumb|large)\.webp$/);
	});
});
