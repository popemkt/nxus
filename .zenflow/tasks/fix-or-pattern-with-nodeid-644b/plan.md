# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: 94ffe80c-e674-4f58-a25c-fe3df650af68 -->

Assess the task's difficulty, as underestimating it leads to poor outcomes.
- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:
- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `{@artifacts_path}/spec.md`:
- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

Save to `{@artifacts_path}/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [ ] Step: Fix critical OR pattern in query-subscription signature and all UI fallback patterns

Apply all fixes from `spec.md`:

1. **Critical fix** — `query-subscription.service.ts:213`: Change `s.systemId || s.id` to `s.id` in `computeNodeSignature()`. This ensures stable, consistent signatures for change detection.
2. **UI fixes** — Replace `||` with `??` (nullish coalescing) in all display fallback chains across:
   - `supertag-filter.tsx` (lines 118, 119, 123)
   - `graph.server.ts` (lines 234, 242, 452)
   - `use-graph-data.ts` (line 179)
   - `NodeInspector.tsx` (lines 211, 213, 370, 406, 551, 588)
   - `apps/nxus-core/.../node-inspector.tsx` (line 235)
   - `mini-app-example.ts` (line 49)
3. Run `pnpm test:libs` to verify all tests pass.
4. Write report to `{@artifacts_path}/report.md`.
