/// <reference lib="webworker" />

/**
 * Minimal service worker: it only serves an offline page when a page can't be loaded.
 * Nothing else is cached, so lists and claims are always fresh from the server.
 */
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `offline-${version}`;
const OFFLINE = '/offline.html';

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([OFFLINE, '/favicon.svg']))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') return;
	event.respondWith(
		fetch(event.request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error())
	);
});
