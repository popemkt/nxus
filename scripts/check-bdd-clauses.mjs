#!/usr/bin/env node
// Gate for spec/rules/bdd-clauses.md (guards: artifact, I5).
//
// Scans spec/**/*.md for coded behavior clauses (`- **<CODE>** — Given …`)
// and every *.test.ts / *.spec.ts in the repo for test titles carrying a
// code (`'<CODE>: ...'`). Fails when:
//   - a clause is neither matched by a guarding test title nor marked
//     `(unguarded)` (and isn't `(retired ...)`), or
//   - a test title carries a code with no corresponding spec clause
//     (orphan — the code was renamed/removed in the spec but a test still
//     claims to guard it).
//
// Same shape as scripts/generate-rules-index.mjs --check: read-only,
// non-zero exit on drift.
//
// Usage: pnpm clauses:check  (CI lint job runs it on every PR)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.nx',
  '.turbo',
  'coverage',
  'out',
  '.next',
  '.codebase-memory',
  '.claude',
])

function walk(dir, matches, test) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && !entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      walk(full, matches, test)
    } else if (test(entry.name)) {
      matches.push(full)
    }
  }
  return matches
}

const specFiles = walk(join(ROOT, 'spec'), [], (name) => name.endsWith('.md'))
const testFiles = walk(ROOT, [], (name) => /\.(test|spec)\.tsx?$/.test(name))

// CODE = <PREFIX><digits?>-B<n><letter?>  e.g. INV8-B3, REST-B4a, ACT-B1, BOOT-B2
const CODE = String.raw`[A-Z][A-Z0-9]*-B\d+[a-z]?`
const CLAUSE_LINE_RE = new RegExp(`^\\s*-\\s+\\*\\*(${CODE})\\*\\*\\s+[—–-]\\s+(.*)$`)
const TITLE_CODE_RE = new RegExp(`(['"\`])(${CODE}):\\s`, 'g')

// code -> [{ file, line, retired, unguarded }]
const clauses = new Map()
for (const file of specFiles) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const m = line.match(CLAUSE_LINE_RE)
    if (!m) return
    const [, code, rest] = m
    const entry = {
      file: relative(ROOT, file),
      line: i + 1,
      retired: /^\(retired\b/.test(rest.trim()),
      unguarded: /\(unguarded\b/.test(rest),
    }
    if (!clauses.has(code)) clauses.set(code, [])
    clauses.get(code).push(entry)
  })
}

// code -> [{ file }]
const guardingTests = new Map()
for (const file of testFiles) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(TITLE_CODE_RE)) {
    const code = m[2]
    if (!guardingTests.has(code)) guardingTests.set(code, [])
    guardingTests.get(code).push({ file: relative(ROOT, file) })
  }
}

const errors = []

for (const [code, entries] of clauses) {
  for (const entry of entries) {
    if (entry.retired || entry.unguarded) continue
    if (!guardingTests.has(code)) {
      errors.push(
        `clause ${code} (${entry.file}:${entry.line}) has no guarding test and is not marked (unguarded)`,
      )
    }
  }
}

for (const [code, tests] of guardingTests) {
  if (!clauses.has(code)) {
    for (const t of tests) {
      errors.push(`orphan: test title code ${code} (${t.file}) has no corresponding spec clause`)
    }
  }
}

if (errors.length > 0) {
  console.error(`check-bdd-clauses: FAIL — ${errors.length} issue(s):`)
  for (const e of errors.sort()) console.error(`  - ${e}`)
  process.exit(1)
}

const clauseCount = [...clauses.values()].reduce((n, e) => n + e.length, 0)
console.log(
  `check-bdd-clauses: ok (${clauseCount} clauses across ${clauses.size} codes, ` +
    `${guardingTests.size} guarded codes, ${specFiles.length} spec files, ${testFiles.length} test files scanned)`,
)
