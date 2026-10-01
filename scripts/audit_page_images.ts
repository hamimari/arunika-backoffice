// Lists existing dongeng page images that fail the page image check
// (src/lib/pageImage.ts), so they can be re-cropped and replaced by hand.
//
//   API_BASE_URL=https://api.example.com ADMIN_EMAIL=… ADMIN_PASSWORD=… \
//     node scripts/audit_page_images.ts
//
// Node ≥22.18 runs this file directly (type stripping). Read-only: it only
// logs in and issues GETs.
import { checkPageImage, pageImageError, type ImageSize } from '../src/lib/pageImage.ts';

const base = (process.env.API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

interface FairyTale { id: string; title: string }
interface Page { page_number?: number; image_url?: string }

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Reads width/height from PNG, JPEG, GIF or WebP bytes. */
export function imageSize(b: Uint8Array): ImageSize | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: IHDR right after the 8-byte signature.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // JPEG: walk segments to the first SOFn marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (dv.getUint8(i) !== 0xff) { i++; continue; }
      const marker = dv.getUint8(i + 1);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5) };
      i += 2 + dv.getUint16(i + 2);
    }
    return null;
  }
  // WebP (RIFF....WEBP)
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8X') {
      return { width: 1 + (dv.getUint32(24, true) & 0xffffff), height: 1 + (dv.getUint32(27, true) & 0xffffff) };
    }
    if (chunk === 'VP8L') {
      const bits = dv.getUint32(21, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') {
      return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    }
  }
  return null;
}

async function checkUrl(url: string): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    const res = await fetch(url);
    if (!res.ok) return `could not load (HTTP ${res.status})`;
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return `could not load (${(e as Error).message})`;
  }
  const size = imageSize(bytes);
  if (!size) return 'could not load (not a PNG/JPEG/GIF/WebP image)';
  const result = checkPageImage(size);
  return result === 'ok' ? null : pageImageError(size, result);
}

async function main() {
  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and API_BASE_URL).');
    process.exit(2);
  }
  const login = await fetch(`${base}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login: HTTP ${login.status}`);
  const { access_token: token } = (await login.json()) as { access_token: string };

  const tales: FairyTale[] = [];
  for (let page = 1; ; page++) {
    const res = await getJson<{ data: FairyTale[]; total: number }>(
      `/admin/content/fairy-tales?page=${page}&per_page=100`, token);
    tales.push(...res.data);
    if (res.data.length === 0 || tales.length >= res.total) break;
  }

  let checked = 0;
  let failed = 0;
  for (const tale of tales) {
    const { data: pages } = await getJson<{ data: Page[] }>(
      `/admin/content/dongen-pages?dongeng_id=${encodeURIComponent(tale.id)}`, token);
    for (const p of pages ?? []) {
      const url = p.image_url?.trim();
      if (!url) continue;
      checked++;
      const problem = await checkUrl(url);
      if (problem) {
        failed++;
        console.log(`${tale.title} · page ${p.page_number ?? '?'} · ${problem}\n    ${url}`);
      }
    }
  }
  console.log(`\n${checked} page images checked, ${failed} failing.`);
  process.exitCode = failed > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
