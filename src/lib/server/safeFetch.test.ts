import { describe, expect, it } from 'vitest';
import { FetchBlockedError, validateUrl } from './safeFetch';

describe('validateUrl', () => {
	// Node skips DNS lookup for IP-literal hosts, so these must be caught before connecting.
	it.each([
		'http://127.0.0.1/',
		'http://169.254.169.254/latest/meta-data/',
		'http://10.0.0.5/',
		'http://2130706433/',
		'http://0x7f.1/',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'https://[fd00::1]/',
		'ftp://example.com/',
		'http://example.com:8080/',
		'http://user:pass@example.com/'
	])('blocks %s', (url) => expect(() => validateUrl(url)).toThrow(FetchBlockedError));

	it.each(['https://example.com/product', 'http://93.184.216.34/', 'https://[2606:4700:4700::1111]/'])('allows %s', (url) =>
		expect(() => validateUrl(url)).not.toThrow()
	);
});
