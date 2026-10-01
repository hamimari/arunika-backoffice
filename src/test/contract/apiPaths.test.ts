import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Asserts every backend path this admin panel calls is actually served by the
 * backend, by checking it against the vendored OpenAPI document.
 *
 * src/test/contract/openapi.yaml is a copy published by arunika-backend. A
 * scheduled job opens a pull request when the upstream document changes, so a
 * stale copy surfaces as a review item rather than as a silently passing test.
 *
 * Known limit: this compares paths, not semantics. A call to a path that
 * happens to match a parameterised route (`/admin/users/active` matching
 * `/admin/users/{id}`) routes fine and does the wrong thing; catching that
 * needs response validation, which lives in the backend's contract suite.
 */

const API_DIR = join(__dirname, '..', '..', 'api');
const SPEC = join(__dirname, 'openapi.yaml');

function specPaths(): string[] {
  const doc = parse(readFileSync(SPEC, 'utf8')) as { paths: Record<string, unknown> };
  return Object.keys(doc.paths);
}

/**
 * Extracts the paths reachable from src/api/*.ts, reading the source rather
 * than listing them here — a hand-written list silently omits exactly the
 * call site that drifted, which is how this kind of test fails at its own job.
 *
 * Template literals are normalised: `${base}` is expanded from the module's
 * own `const base = '...'`, and any other `${...}` becomes a `{param}`
 * placeholder matching the spec's shape.
 */
function clientPaths(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = [];

  for (const file of readdirSync(API_DIR).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(API_DIR, file), 'utf8');

    // A module-level or function-level `const base = '/admin/...'`, possibly
    // itself a template (content.ts builds `/admin/content/${type}`).
    const baseMatch = source.match(/const base = [`']([^`']+)[`']/);
    const base = baseMatch ? baseMatch[1].replace(/\$\{[^}]+\}/g, '{param}') : '';

    const calls = source.matchAll(
      /\b(?:api|client)\.(?:get|post|put|patch|delete)\(\s*[`']([^`']+)[`']/g,
    );
    for (const call of calls) {
      let path = call[1];
      if (!path.startsWith('/') && !path.startsWith('$')) continue;
      path = path.replace(/\$\{base\}/g, base);
      path = path.replace(/\$\{[^}]+\}/g, '{param}');
      path = path.split('?')[0];
      if (path.endsWith('/')) path = path.slice(0, -1);
      if (path.startsWith('/')) found.push({ file, path });
    }
  }
  return found;
}

/** A client path matches if the spec declares it, allowing `{...}` wildcards. */
function served(path: string, spec: string[]): boolean {
  if (spec.includes(path)) return true;

  const want = path.split('/');
  return spec.some((candidate) => {
    const have = candidate.split('/');
    if (have.length !== want.length) return false;
    return have.every((seg, i) => {
      if (seg.startsWith('{') && seg.endsWith('}')) return true;
      if (want[i].startsWith('{') && want[i].endsWith('}')) return true;
      return seg === want[i];
    });
  });
}

describe('backoffice ↔ backend contract', () => {
  it('should_find_call_sites_to_check', () => {
    // Guards the extractor: if the regexes stop matching, every other
    // assertion here passes vacuously.
    expect(clientPaths().length).toBeGreaterThan(20);
  });

  it('should_serve_every_path_the_backoffice_calls', () => {
    const spec = specPaths();
    const unserved = clientPaths().filter(({ path }) => !served(path, spec));

    expect(
      unserved.map(({ file, path }) => `${file}: ${path}`),
      'these call sites name routes the backend does not serve',
    ).toEqual([]);
  });

  it('should_reject_a_path_the_backend_does_not_serve', () => {
    // Guards the matcher itself against being permanently true.
    expect(served('/definitely/not/a/route', specPaths())).toBe(false);
  });
});
