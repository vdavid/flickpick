import raw from './data/catalog.json';
import type { Title } from './types';

export const catalog: Title[] = raw as Title[];

const byId = new Map(catalog.map((t) => [t.id, t]));

export function getTitle(id: string): Title | undefined {
	return byId.get(id);
}

/** "2008-2013", "2016-", "1999" */
export function yearLabel(t: Title): string {
	if (t.type === 'movie') return String(t.year);
	if (t.endYear === t.year) return String(t.year);
	return `${t.year}–${t.endYear ?? ''}`;
}

export const allGenres: string[] = [...new Set(catalog.flatMap((t) => t.genres))].sort();
