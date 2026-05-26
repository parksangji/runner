import { runner } from '../api';

let cache: { layout: string; pinned: string } | null = null;

export async function persistedPaths(): Promise<{ layout: string; pinned: string }> {
  if (cache) return cache;
  cache = await runner().persist.paths();
  return cache;
}
