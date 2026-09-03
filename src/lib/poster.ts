/** Deterministic fallback art, so the deck looks intentional before OMDb posters
 *  are baked in by `npm run enrich`. Same title always gets the same colours. */
function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h);
}

export function placeholderGradient(id: string): string {
	const h = hash(id);
	const hue = h % 360;
	const hue2 = (hue + 40 + (h % 60)) % 360;
	return `linear-gradient(150deg, hsl(${hue} 62% 32%), hsl(${hue2} 58% 16%))`;
}
