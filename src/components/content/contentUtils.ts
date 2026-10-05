/** Shared by the Konten Belajar editors (Huruf, Angka). */

/** Autosave fires this long after the last edit. */
export const AUTOSAVE_MS = 2000;

export type StatusFilter = 'all' | 'published' | 'draft' | 'hidden';

/** What a status tag needs from a row. Items with a version history (letters,
 *  levels) are drafts until they have a version; objects and numbers until
 *  their status leaves "draft". */
export interface StatusItem {
  status: 'draft' | 'published' | 'hidden';
  has_unpublished_changes: boolean;
  version?: number | null;
}

/** Which status tab an item belongs to. "Ada perubahan" counts as Terbit. */
export function statusGroup(item: StatusItem): Exclude<StatusFilter, 'all'> {
  if (item.status === 'hidden') return 'hidden';
  return item.version === null || item.status === 'draft' ? 'draft' : 'published';
}

/** A problem with an external URL the backend would also refuse or the app
 *  couldn't load, or null. */
export function urlWarning(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return 'URL harus lengkap, misalnya https://media.haloarunika.com/huruf/apel.png';
  }
  if (u.protocol !== 'https:') return 'URL harus diawali https://';
  if (u.hostname.endsWith('.r2.dev')) {
    return 'Domain r2.dev diblokir sebagian provider di Indonesia. Pakai domain sendiri, misalnya media.haloarunika.com.';
  }
  return null;
}

/** A published version, as the versions endpoints list it. */
export interface ContentVersion {
  id: string;
  version: number;
  published_by: string;
  published_at: string;
  is_current: boolean;
}
