import { describe, expect, it } from 'vitest';
import { isPreviewBot, listMeta } from './meta';

describe('isPreviewBot', () => {
	it.each([
		'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
		'WhatsApp/2.23.20.0 A',
		'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
		'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
		'TelegramBot (like TwitterBot)',
		'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'
	])('spots %s', (ua) => expect(isPreviewBot(ua)).toBe(true));

	it.each([
		null,
		'',
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
	])('lets people through: %s', (ua) => expect(isPreviewBot(ua)).toBe(false));
});

describe('listMeta', () => {
	it('names the owner, counts wishes and adds the date', () => {
		expect(listMeta({ title: 'Birthday', eventDate: '2020-03-04' }, 'Meg', 3)).toEqual({
			title: 'Birthday',
			description: "Meg's wish list · 3 items · 4 Mar 2020"
		});
		expect(listMeta({ title: 'Xmas', eventDate: null }, 'Meg', 1).description).toBe("Meg's wish list · 1 item");
	});
});
