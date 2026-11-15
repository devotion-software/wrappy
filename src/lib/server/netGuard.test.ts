import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './netGuard';

describe('isPublicAddress', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.20.0.5',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'::1',
		'::',
		'fd00::1',
		'fe80::1',
		'::ffff:127.0.0.1',
		'::ffff:10.0.0.1',
		'::ffff:7f00:1',
		'::ffff:a9fe:a9fe',
		'::7f00:1',
		'2002:7f00:1::1',
		'not-an-ip'
	])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));

	it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808'])('allows %s', (ip) =>
		expect(isPublicAddress(ip)).toBe(true)
	);
});

describe('isPublicAddress — more ranges', () => {
	it.each([
		'0.1.2.3',
		'127.255.255.255',
		'172.16.0.0',
		'172.31.255.255',
		'192.0.0.8',
		'192.0.2.10',
		'198.18.0.1',
		'198.19.255.255',
		'198.51.100.7',
		'203.0.113.9',
		'224.0.0.1',
		'239.255.255.250',
		'240.0.0.1',
		'255.255.255.255',
		'100.127.255.255',
		'64:ff9b::808:808',
		'100::1',
		'2001:db8::1',
		'fc00::1',
		'febf::1',
		'ff02::1',
		'::FFFF:127.0.0.1',
		'FD00::1',
		'',
		'1.2.3',
		'256.1.1.1'
	])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));

	it.each(['172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0', '198.17.255.255', '223.255.255.255', '8.8.4.4', '2a00:1450:4009::200e', '::ffff:1.1.1.1'])(
		'allows %s',
		(ip) => expect(isPublicAddress(ip)).toBe(true)
	);
});
