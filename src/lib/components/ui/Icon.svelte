<script lang="ts" module>
	// Simple stroke icons (1.8px, round caps/joins) from the design reference.
	const PATHS = {
		tick: '<path d="M4 13c2 1.5 3.5 3.5 4.5 5.5C11 12 15 7 21 3"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
		'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
		link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
		edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
		'eye-off':
			'<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.2 3.3M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>',
		lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		users:
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
		mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
		shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
		key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
		globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
		list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
		trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
	} as const;

	export type IconName = keyof typeof PATHS | 'star';
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		size?: number;
		strokeWidth?: number;
		label?: string;
	}
	let { name, size = 18, strokeWidth = 1.8, label }: Props = $props();
</script>

{#if name === 'star'}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="var(--gold)"
		stroke="var(--gold)"
		stroke-width="1.5"
		stroke-linejoin="round"
		class="icon icon-{name}"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
		><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg
	>
{:else}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width={strokeWidth}
		stroke-linecap="round"
		stroke-linejoin="round"
		class="icon icon-{name}"
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
	>
		{@html PATHS[name]}
	</svg>
{/if}
