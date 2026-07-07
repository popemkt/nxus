#!/usr/bin/env node
// Programmatic gate for spec/rules/spec-first-change.md (guards: I4).
// Fails when a diff range touches product code (apps/ or libs/ *.ts/*.tsx)
// without touching spec/, unless the range carries an explicit marker:
//   - a commit message (or the diff itself) containing "DRIFT:"  — divergence recorded instead
//   - a commit message containing "spec-exempt: <reason>"        — explicit opt-out with a why
//
// Usage: node scripts/check-spec-first.mjs [<base>...<head>]
// Default range: origin/main...HEAD (CI passes the PR base explicitly).

import { execFileSync } from 'node:child_process';

const range = process.argv[2] ?? 'origin/main...HEAD';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

let changedFiles;
try {
  changedFiles = git('diff', '--name-only', range).split('\n').filter(Boolean);
} catch (error) {
  console.error(`check-spec-first: cannot diff range '${range}': ${error.message}`);
  process.exit(2);
}

const codeChanged = changedFiles.filter(
  (f) => /^(apps|libs)\/.+\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.(ts|tsx)$/.test(f),
);
const specChanged = changedFiles.some((f) => f.startsWith('spec/'));

if (codeChanged.length === 0 || specChanged) {
  console.log('check-spec-first: ok');
  process.exit(0);
}

const messages = git('log', '--format=%B', range);
const diffText = git('diff', range, '--', ...codeChanged);
const hasMarker = /DRIFT:/.test(messages) || /spec-exempt:/.test(messages) || /DRIFT:/.test(diffText);

if (hasMarker) {
  console.log('check-spec-first: ok (marker present — DRIFT:/spec-exempt:)');
  process.exit(0);
}

console.error(
  [
    'check-spec-first: FAIL — product code changed without a spec change.',
    '',
    'Changed code files:',
    ...codeChanged.map((f) => `  - ${f}`),
    '',
    'The spec is the artifact of record (spec/rules/spec-first-change.md).',
    'Fix one of:',
    '  1. land the spec edit in this same range,',
    '  2. record the divergence as a DRIFT: block (searchable, honest), or',
    "  3. mark a commit 'spec-exempt: <reason>' if no spec text is invalidated",
    '     (pure refactor, dead-code deletion, test-only support code).',
  ].join('\n'),
);
process.exit(1);
