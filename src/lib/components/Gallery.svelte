<script lang="ts">
	import { imageUrl } from '#lib/images';

	/** Swipeable picture gallery (scroll-snap) with thumbnails. */
	interface Props {
		images: { id: string; storageKey: string; alt: string | null }[];
		title: string;
	}
	let { images, title }: Props = $props();
	let track = $state<HTMLDivElement>();
	let current = $state(0);

	function go(i: number) {
		track?.children[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
	}
	function onScroll() {
		if (!track) return;
		current = Math.round(track.scrollLeft / track.clientWidth);
	}
</script>

{#if images.length}
	<div class="gallery">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard-focusable) -->
		<div class="track" bind:this={track} onscroll={onScroll} tabindex="0" role="region" aria-label="Pictures of {title}">
			{#each images as img, i (img.id)}
				<figure class="slide">
					<img src={imageUrl(img.storageKey, 'large')} alt={img.alt ?? `${title}, picture ${i + 1}`} loading={i ? 'lazy' : 'eager'} />
				</figure>
			{/each}
		</div>
		{#if images.length > 1}
			<div class="thumbs">
				{#each images as img, i (img.id)}
					<button type="button" class="thumb" aria-label="Show picture {i + 1}" aria-current={current === i} onclick={() => go(i)}>
						<img src={imageUrl(img.storageKey, 'thumb')} alt="" loading="lazy" />
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.gallery {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.track {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		border-radius: 4px;
		background: var(--desk);
	}
	.track::-webkit-scrollbar {
		display: none;
	}
	.slide {
		flex: 0 0 100%;
		margin: 0;
		scroll-snap-align: start;
		aspect-ratio: 4 / 3;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.slide img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.thumbs {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.thumb {
		width: 56px;
		height: 56px;
		padding: 0;
		border: 2px solid transparent;
		border-radius: 4px;
		overflow: hidden;
		background: var(--desk);
		cursor: pointer;
		opacity: 0.7;
		transition:
			border-color 0.2s,
			opacity 0.2s,
			transform 0.2s;
	}
	.thumb:hover {
		opacity: 1;
		transform: translateY(-2px);
	}
	.thumb[aria-current='true'] {
		border-color: var(--gold);
		opacity: 1;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
