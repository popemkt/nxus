---
name: "Merge & Ship"
description: Merge main, resolve conflicts, push, create/update PR, monitor checks and comments, get PR to ready state
category: Git
tags: [git, pr, ci, workflow]
---

Merge main into the current branch, resolve any conflicts, push, and get the PR to a ready state.

**Steps**

1. **Fetch and merge main**

   ```bash
   git fetch origin main
   git merge origin/main
   ```

   - If merge succeeds cleanly, continue to step 3.
   - If there are conflicts, proceed to step 2.

2. **Resolve merge conflicts**

   For each conflicted file:
   - Read the file to understand both sides of the conflict
   - Resolve intelligently: keep changes from both sides where possible, prefer the feature branch's intent
   - `git add <file>` after resolving

   After all conflicts resolved:
   ```bash
   git commit
   ```

   If you cannot confidently resolve a conflict (e.g., complex logic changes on both sides), pause and ask the user.

3. **Push the branch**

   ```bash
   git push
   ```

   If the branch has no upstream yet:
   ```bash
   git push -u origin HEAD
   ```

4. **Create or find the PR**

   Check if a PR already exists for this branch:
   ```bash
   gh pr view --json number,title,url 2>/dev/null
   ```

   - If no PR exists, create one using `gh pr create` with a clear title and summary based on the branch commits.
   - If PR exists, note its URL and continue.

5. **Monitor CI checks**

   Poll for check status (up to 15 minutes):
   ```bash
   gh pr checks --watch --fail-fast
   ```

   - If all checks pass, continue to step 6.
   - If a check fails:
     - Read the failure details: `gh run view <run-id> --log-failed`
     - Attempt to fix the issue (lint errors, type errors, test failures)
     - Commit the fix, push, and re-monitor
     - If you cannot fix it after 2 attempts, report to the user and stop

6. **Check for PR review comments**

   ```bash
   gh pr view --json reviews,comments
   ```

   Also check inline comments:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments
   ```

   For each comment/review:
   - If it's a legitimate issue (bug, logic error, style violation): fix it, commit, push
   - If it's a question: respond on the PR with context
   - If it's a nitpick or optional suggestion: skip unless trivial to address
   - After fixing, re-run step 5 to verify checks still pass

7. **Final status**

   Report:
   - PR URL
   - Merge status (clean or conflicts resolved)
   - CI status (passing)
   - Review comments addressed (if any)
   - Whether PR is ready for review/merge

**Guardrails**
- Never force-push. If push is rejected, pull and retry.
- Never skip CI checks or dismiss reviews.
- If the branch is `main` or `master`, refuse and tell the user.
- If merge conflicts involve complex logic you can't confidently resolve, ask the user.
- Maximum 2 fix-and-retry cycles for CI failures before escalating to user.
- Do not approve or merge the PR — only get it to a ready state for human review.
