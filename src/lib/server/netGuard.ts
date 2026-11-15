import { BlockList, isIP } from 'node:net';

/**
 * Addresses the link fetcher must never connect to (SSRF guard): loopback, private,
 * link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast, reserved, and
 * the IPv6 equivalents, including IPv4-mapped IPv6.
 */
const blocked = new BlockList();
for (const [net, bits] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4]
] as const) {
	blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
	['::', 128],
	['::1', 128],
	['64:ff9b::', 96],
	['100::', 64],
	['2001:db8::', 32],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8]
] as const) {
	blocked.addSubnet(net, bits, 'ipv6');
}

export function isPublicAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 0) return false;
	if (family === 6) {
		const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPublicAddress(mapped[1]);
		return !blocked.check(ip, 'ipv6');
	}
	return !blocked.check(ip, 'ipv4');
}
