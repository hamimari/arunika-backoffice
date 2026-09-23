#!/usr/bin/env node
// Coverage ratchet — compares the current run against coverage-baseline.json
// and reports any package that dropped.
//
// Phase 1 of the automation testing strategy runs this in REPORT-ONLY mode:
// it prints drops and exits 0. Set RATCHET_ENFORCE=1 (planned for Phase 4) to
// make a drop fail the build instead.
//
// Baselines are grouped by top-level directory under src/ rather than by file,
// so adding a file to an already-covered area doesn't need a baseline edit.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SUMMARY = resolve(ROOT, 'coverage/coverage-summary.json')
const BASELINE = resolve(ROOT, 'coverage-baseline.json')
const ENFORCE = process.env.RATCHET_ENFORCE === '1'
const WRITE = process.argv.includes('--write')

if (!existsSync(SUMMARY)) {
  console.error(`No coverage summary at ${relative(ROOT, SUMMARY)}. Run: npm run test:ci`)
  process.exit(1)
}

const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'))

// Roll per-file statement counts up into "src/<dir>" groups.
const groups = new Map()
for (const [file, data] of Object.entries(summary)) {
  if (file === 'total') continue
  const rel = relative(ROOT, file)
  if (!rel.startsWith('src' + sep)) continue
  const parts = rel.split(sep)
  const group = parts.length > 2 ? `src/${parts[1]}` : 'src'
  const g = groups.get(group) ?? { covered: 0, total: 0 }
  g.covered += data.statements.covered
  g.total += data.statements.total
  groups.set(group, g)
}

const current = {}
for (const [name, { covered, total }] of [...groups].sort()) {
  current[name] = total === 0 ? 100 : Number(((covered / total) * 100).toFixed(1))
}
current.total = Number(summary.total.statements.pct.toFixed(1))

if (WRITE || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n')
  console.log(`Wrote baseline to ${relative(ROOT, BASELINE)}:`)
  for (const [k, v] of Object.entries(current)) console.log(`  ${k.padEnd(24)} ${v}%`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const drops = []

for (const [name, pct] of Object.entries(current)) {
  const base = baseline[name]
  if (base === undefined) {
    console.log(`  ${name.padEnd(24)} ${pct}%  (new — not yet in baseline)`)
    continue
  }
  // 0.1pp of slack absorbs rounding noise when a file moves between groups.
  if (pct < base - 0.1) {
    drops.push({ name, base, pct })
    console.log(`  ${name.padEnd(24)} ${pct}%  ↓ from ${base}%`)
  } else {
    console.log(`  ${name.padEnd(24)} ${pct}%`)
  }
}

if (drops.length === 0) {
  console.log('\nCoverage ratchet: no regressions.')
  process.exit(0)
}

console.log(`\nCoverage ratchet: ${drops.length} package(s) dropped.`)
if (!ENFORCE) {
  console.log('Report-only mode — not failing the build. Set RATCHET_ENFORCE=1 to enforce.')
  process.exit(0)
}
process.exit(1)
