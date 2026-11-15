<script lang="ts">
	import Logo from '#lib/components/ui/Logo.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import StickyNote from '#lib/components/ui/StickyNote.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { writeIn } from '#lib/motion';

	// The hero list is a little demo: tap a row to reserve it.
	let heroItems = $state([
		{ name: 'Wireless headphones', taken: true, tilt: -3 },
		{ name: 'Hardback cookbook', taken: false, tilt: 2 },
		{ name: 'Film camera', taken: false, star: true, tilt: -1 },
		{ name: 'Trailing pothos plant', taken: false, tilt: 1.5 }
	]);
	let tried = $state(false);
	const santaNames = ['Meg', 'Sam', 'Priya', 'Tom', 'Grandma Jo', 'Leo'];
</script>

<svelte:head><title>Wishlist — write it down, share it, keep the surprise</title></svelte:head>

<header class="container top">
	<Logo />
	<nav>
		<a href="#how">How it works</a>
		<a href="#santa">Secret Santa</a>
		<a href="/signin">Log in</a>
		<a href="/signin" class="btn btn-dark btn-md">Start a list</a>
	</nav>
</header>

<section class="container hero">
	<div class="hero-copy rise-in">
		<p class="kicker hand">for birthdays, weddings &amp; the holidays</p>
		<h1 class="hand">Write it down.<br />Share it.<br />Keep the surprise.</h1>
		<p class="lede">
			Jot down the things you'd love, share your list with friends and family, and let them quietly
			claim gifts. You'll never see who's getting what.
		</p>
		<div class="ctas">
			<a href="/signin" class="btn btn-primary btn-lg"
				>Start your list <Icon name="arrow-right" strokeWidth={2} /></a
			>
			<a href="#santa" class="btn btn-outline btn-lg">Run a Secret Santa</a>
		</div>
	</div>

	<div class="hero-art">
		<Sheet tape tilt={-1.5} margin={46} padding="30px 28px 22px 68px" class="hero-sheet">
			<p class="hand sheet-title">Meg's 30th</p>
			{#each heroItems as it (it.name)}
				<button
					type="button"
					class="hero-row"
					aria-pressed={it.taken}
					onclick={() => {
						it.taken = !it.taken;
						tried = true;
					}}
				>
					<Checkbox checked={it.taken} size={22} tilt={it.tilt} />
					<span class="write hero-item" class:struck={it.taken}>{it.name}</span>
					{#if it.taken}<span class="note" in:writeIn>reserved</span>{/if}
					{#if it.star}<Icon name="star" size={20} label="Most wanted" />{/if}
				</button>
			{/each}
			<p class="hand try" class:gone={tried} aria-hidden="true">go on, tick one off ↑</p>
		</Sheet>
		<div class="hero-sticky">
			<StickyNote tilt={3} padding="18px 20px">
				<p class="eyebrow">Secret Santa</p>
				<p class="hand sticky-title">You're buying for Sam!</p>
				<p class="sticky-meta">Under £20 · see Sam's list</p>
			</StickyNote>
		</div>
	</div>
</section>

<section id="how" class="band">
	<div class="container band-inner">
		<div class="band-head">
			<p class="eyebrow">How it works</p>
			<h2 class="hand big">As easy as a note on the fridge</h2>
		</div>
		<div class="steps">
			<div class="step">
				<span class="hand step-num">1.</span>
				<h3>Write your list</h3>
				<p>
					Paste a link from any shop and we'll fill in the name, pictures and price. Or just jot it
					down — "something cosy to read" counts.
				</p>
			</div>
			<div class="step">
				<span class="hand step-num">2.</span>
				<h3>Share it</h3>
				<p>
					Send a private link, invite people by email, or make a list public on your profile.
					Friends open it on any phone or laptop.
				</p>
			</div>
			<div class="step">
				<span class="hand step-num">3.</span>
				<h3>They claim, you're surprised</h3>
				<p>
					Friends tick off what they're buying so nobody doubles up. You never see what's been
					claimed.
				</p>
			</div>
		</div>
	</div>
</section>

<section class="container split">
	<div class="split-copy">
		<p class="eyebrow">No spoilers</p>
		<h2 class="hand big">Same list, two views</h2>
		<p class="body">
			You see your list exactly as you wrote it. Your friends see what's still up for grabs. Claimed
			and bought gifts stay hidden from you until you've opened your presents.
		</p>
	</div>
	<div class="views">
		<Sheet margin={false} padding="22px">
			<p class="view-label">What Meg sees</p>
			<div class="ruled">
				<p class="write view-row">Wireless headphones</p>
				<p class="write view-row">Hardback cookbook</p>
				<p class="write view-row">Film camera</p>
			</div>
		</Sheet>
		<Sheet margin={false} padding="22px">
			<p class="view-label">What her friends see</p>
			<div class="ruled">
				<div class="view-row between">
					<p class="write struck">Wireless headphones</p>
					<span class="note small">reserved</span>
				</div>
				<div class="view-row between">
					<p class="write">Hardback cookbook</p>
					<span class="claim">I'll get it</span>
				</div>
				<div class="view-row between">
					<p class="write">Film camera</p>
					<span class="claim">I'll get it</span>
				</div>
			</div>
		</Sheet>
	</div>
</section>

<section id="santa" class="band">
	<div class="container band-inner split reverse">
		<div class="santa-art">
			<StickyNote tilt={1} padding="28px 30px">
				<p class="hand santa-title">Family Secret Santa</p>
				<p class="sticky-meta">Under £20 · names drawn 1 Dec</p>
				<div class="santa-names">
					{#each santaNames as n (n)}<p class="write">{n}</p>{/each}
				</div>
				<div class="btn btn-dark btn-block draw" aria-hidden="true">
					<Icon name="shuffle" strokeWidth={2} />Draw names
				</div>
			</StickyNote>
		</div>
		<div class="split-copy">
			<p class="eyebrow">Secret Santa</p>
			<h2 class="hand big">No hat, no scraps of paper</h2>
			<p class="body">
				Share a join link, set a budget and a date, and we'll draw names for you. Each person gets an
				email with who they're buying for — along with that person's wish list.
			</p>
			<p class="body">Want to keep couples apart? Add a rule and it's handled.</p>
			<a href="/signin" class="btn btn-outline btn-md self-start">Start a Secret Santa</a>
		</div>
	</div>
</section>

<section class="container final">
	<h2 class="hand final-title">What's on your list this year?</h2>
	<p class="lede">Free to use. Your first list takes about a minute.</p>
	<a href="/signin" class="btn btn-primary btn-lg">Start your list</a>
</section>

<SiteFooter />

<style>
	.top {
		padding-top: 24px;
		padding-bottom: 24px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		max-width: 1200px;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 28px;
		font-size: 15px;
	}
	nav a:not(.btn) {
		text-decoration: none;
		color: var(--ink2);
	}

	.hero {
		max-width: 1200px;
		padding-top: 56px;
		padding-bottom: 96px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 64px;
	}
	.hero-copy {
		flex: 1 1 440px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.kicker {
		margin: 0;
		font-size: 28px;
		color: var(--gold-text);
	}
	h1 {
		margin: 0;
		font-size: clamp(60px, 7vw, 96px);
		line-height: 0.92;
	}
	.lede {
		margin: 0;
		max-width: 500px;
		font-size: 18px;
		line-height: 1.6;
		color: var(--ink2);
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding-top: 4px;
	}
	.hero-art {
		flex: 1 1 440px;
		position: relative;
		padding: 24px 12px 56px;
	}
	.hero-art :global(.hero-sheet) {
		max-width: 480px;
		margin: 0 auto;
	}
	.sheet-title {
		margin: 0 0 12px;
		font-size: 40px;
	}
	.hero-row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		height: 56px;
		padding: 0;
		border: 0;
		border-top: 1px solid var(--rule);
		background: transparent;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.hero-row:hover .hero-item:not(.struck) {
		color: var(--gold-text);
	}
	/* Sized to its text (margin-right: auto keeps the note on the right) so the strike only spans the words. */
	.hero-item {
		margin-right: auto;
		font-size: 23px;
		background: linear-gradient(var(--gold), var(--gold)) no-repeat 0 58% / 0% 2px;
		transition:
			background-size 0.45s cubic-bezier(0.65, 0, 0.35, 1),
			color 0.3s;
	}
	.struck {
		color: var(--faint);
		background-size: 100% 2px;
	}
	.try {
		margin: 10px 0 0;
		font-size: 22px;
		color: var(--gold-text);
		transition: opacity 0.4s;
		animation: nudge 2.4s ease-in-out 1.6s infinite;
	}
	.try.gone {
		opacity: 0;
	}
	@keyframes nudge {
		0%,
		70%,
		100% {
			translate: 0 0;
		}
		80% {
			translate: 0 -4px;
		}
		90% {
			translate: 0 1px;
		}
	}

	/* On load: the copy rises, the sheet drops onto the desk, then the sticky note is slapped on. */
	.rise-in > :global(*) {
		animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both;
	}
	.rise-in > :global(:nth-child(2)) {
		animation-delay: 60ms;
	}
	.rise-in > :global(:nth-child(3)) {
		animation-delay: 120ms;
	}
	.rise-in > :global(:nth-child(4)) {
		animation-delay: 180ms;
	}
	.hero-art :global(.hero-sheet) {
		animation: drop 0.6s cubic-bezier(0.2, 0.8, 0.3, 1.1) 0.15s both;
	}
	@keyframes drop {
		from {
			opacity: 0;
			translate: 0 -24px;
			scale: 1.03;
		}
	}
	.hero-sticky {
		animation: slap 0.45s cubic-bezier(0.3, 1.4, 0.5, 1) 0.65s both;
	}
	@keyframes slap {
		from {
			opacity: 0;
			scale: 1.25;
		}
	}
	.hero-sticky {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 230px;
	}
	.eyebrow {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold-text);
	}
	.sticky-title {
		margin: 6px 0 0;
		font-size: 30px;
		line-height: 1.05;
	}
	.sticky-meta {
		margin: 6px 0 0;
		font-size: 13px;
		color: var(--ink2);
	}

	.band {
		background: var(--paper);
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.band-inner {
		max-width: 1200px;
		padding-top: 96px;
		padding-bottom: 96px;
		display: flex;
		flex-direction: column;
		gap: 48px;
	}
	.band-head {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 640px;
	}
	.big {
		margin: 0;
		font-size: 60px;
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 32px;
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 20px;
		border-top: 2px solid var(--ink);
	}
	.step-num {
		font-size: 44px;
		color: var(--gold-text);
	}
	.step h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
	}
	.step p,
	.body {
		margin: 0;
		font-size: 16px;
		line-height: 1.6;
		color: var(--ink2);
	}
	.body {
		font-size: 17px;
	}

	.split {
		max-width: 1200px;
		padding-top: 96px;
		padding-bottom: 96px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 56px;
	}
	.split.reverse {
		flex-wrap: wrap-reverse;
	}
	.split-copy {
		flex: 1 1 380px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.self-start {
		align-self: flex-start;
		margin-top: 8px;
	}
	.views {
		flex: 1 1 520px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 20px;
	}
	.view-label {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.view-row {
		margin: 0;
		padding: 10px 0;
		font-size: 21px;
	}
	.view-row p {
		margin: 0;
		font-size: 21px;
	}
	.between {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.note.small {
		font-size: 20px;
	}
	.claim {
		font-size: 13px;
		font-weight: 600;
	}

	.santa-art {
		flex: 1 1 440px;
		display: flex;
		justify-content: center;
	}
	.santa-art > :global(*) {
		width: 100%;
		max-width: 440px;
	}
	.santa-title {
		margin: 0;
		font-size: 36px;
	}
	.santa-names {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px 24px;
	}
	.santa-names p {
		margin: 0;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
		font-size: 22px;
	}
	.draw {
		margin-top: 20px;
		height: 48px;
		cursor: default;
	}

	.final {
		max-width: 1200px;
		padding-top: 112px;
		padding-bottom: 112px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		text-align: center;
	}
	.final-title {
		margin: 0;
		font-size: clamp(52px, 6vw, 76px);
	}

	@media (max-width: 520px) {
		.hero-sticky {
			position: relative;
			width: 230px;
			margin: 24px 0 0 auto;
		}
		.hero-art {
			padding-bottom: 0;
		}
		.big {
			font-size: 48px;
		}
	}
</style>
