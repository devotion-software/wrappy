/**
 * Secret Santa draw: every member gives to exactly one other member and receives from
 * exactly one. Nobody draws themselves, and excluded pairs never draw each other (either way).
 *
 * Backtracking search over givers (most constrained first) with shuffled candidates,
 * so every valid assignment is reachable and impossible setups are detected.
 * Returns giver → receiver, or null when no valid draw exists.
 */
export function drawAssignments(
	memberIds: readonly string[],
	exclusions: readonly (readonly [string, string])[] = [],
	random: () => number = Math.random
): Map<string, string> | null {
	const ids = [...new Set(memberIds)];
	if (ids.length < 2) return null;

	const blocked = new Set<string>();
	for (const [a, b] of exclusions) {
		blocked.add(`${a}\u0000${b}`);
		blocked.add(`${b}\u0000${a}`);
	}
	const allowed = (g: string, r: string) => g !== r && !blocked.has(`${g}\u0000${r}`);

	const options = new Map(ids.map((g) => [g, shuffle(ids.filter((r) => allowed(g, r)), random)]));
	const givers = shuffle(ids, random).sort((a, b) => options.get(a)!.length - options.get(b)!.length);

	const result = new Map<string, string>();
	const taken = new Set<string>();

	const solve = (i: number): boolean => {
		if (i === givers.length) return true;
		const g = givers[i];
		for (const r of options.get(g)!) {
			if (taken.has(r)) continue;
			taken.add(r);
			result.set(g, r);
			if (solve(i + 1)) return true;
			taken.delete(r);
			result.delete(g);
		}
		return false;
	};

	return solve(0) ? result : null;
}

function shuffle<T>(arr: T[], random: () => number): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
