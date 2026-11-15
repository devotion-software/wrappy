export type ImageVariant = 'thumb' | 'large';

/** Public URL for a stored image variant (served by src/routes/img/[...key]). */
export function imageUrl(storageKey: string, variant: ImageVariant): string {
	return `/img/${storageKey}-${variant}.webp`;
}
