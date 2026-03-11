---
name: "Review"
description: Review changed code for false paths, simplification opportunities, type/control flow tightness, and bugs
category: Code Quality
tags: [review, code-quality, types, bugs, simplify]
---

Review changed code for quality issues. Accept a file, directory, PR number/URL, or default to the current branch diff against main.

**What to look for** (ordered by importance):

1. **Bugs** — logic errors, race conditions, missing awaits, null access, wrong comparisons, state mutation issues
2. **False paths** — always-true/false conditions, unreachable branches, redundant guards, silent error swallowing
3. **Loose types** — `any`, string where literal union fits, `as` casts that bypass validation, non-null assertions without proof. Look for types that can be tightened to eliminate code paths entirely — adding a variant to a union so exhaustive checks catch missing cases, narrowing a type so a branch becomes impossible rather than just handled.
4. **Control flow** — nested conditionals that should be early returns, complex booleans that need names, if-else chains that should be maps
5. **Simplification** — reimplemented stdlib/dependency functionality, abstractions with one call site, verbose patterns with simpler equivalents
6. **Convention violations** — check `.claude/rules/` for project-specific rules

**Design-level concerns** (flag when spotted, these are higher-value than line-level issues):

- **Naming accuracy** — does the name match what the code actually does? A function called `getUser` that also creates one is a latent bug
- **Abstraction consistency** — is one function mixing orchestration with low-level detail?
- **Implicit coupling** — does the code assume things happen in a certain order, or that two pieces of state stay in sync without enforcement?
- **Invariant gaps** — if you guard against null here, why not there? Inconsistent guards suggest a missing invariant upstream
- **Side effect containment** — are side effects obvious and isolated, or buried inside helpers?
- **Empty/zero/one cases** — what happens with `[]`, `0`, `null`, a single item, or the maximum?
- **Large files** — if a file is doing too many things, suggest how to break it apart along natural seam lines

**Reporting format:**

Group by file. For each issue: location (`file:line`), severity (`bug`/`issue`/`nit`), short description, and a suggested fix with code when helpful. Skip trivial nits unless asked.

End with a summary: files reviewed, issue counts by severity, top concern, one-sentence assessment.

**Mindset:**

The categories above are starting points, not a checklist. If you see something worth flagging that doesn't fit neatly into any category — an architectural smell, a subtle misuse of a library, a pattern that will age badly — call it out. The best review findings are the ones the author wouldn't have caught themselves.

**Guardrails:**
- Only flag real issues — don't pad with style preferences
- An empty review is valid if the code is good
- Don't suggest changes to unchanged code
- Report only — never auto-fix
