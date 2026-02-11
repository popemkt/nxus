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

### [ ] Step: Implement Glass 3D Cards visual

Build the "Glass 3D" visual component at `src/components/visuals/glass-3d-cards.tsx`:
- CSS 3D perspective container with `transform-style: preserve-3d` cards
- Mouse-tracking tilt via `onMouseMove`/`onMouseLeave` (rotateX/rotateY, max ~15deg)
- Layered card internals: background glow (translateZ -20px), content (translateZ 0), icon (translateZ 30px)
- Glassmorphism: `backdrop-blur-xl`, semi-transparent card bg, subtle white/10 border
- Floating light reflection gradient that shifts with mouse
- Soft primary-colored glow shadow beneath cards
- Uses `MiniApp` interface, existing `iconMap` pattern, theme CSS variables
- Run `npx nx run nxus-gateway:build` to verify no TS errors

### [ ] Step: Implement Terminal Cards visual

Build the "Terminal" visual component at `src/components/visuals/terminal-cards.tsx`:
- Cards styled as terminal windows with dark bg and primary-tinted monospace text
- Top bar with colored dots and fake terminal title
- `>` prompt prefix on app names
- Typing animation on hover via CSS `steps()` on width
- CRT scanline overlay using `repeating-linear-gradient`
- Blinking `_` cursor with `@keyframes` blink
- Add required `@keyframes` to `src/styles.css`
- Uses `MiniApp` interface, existing `iconMap` pattern, theme CSS variables
- Run `npx nx run nxus-gateway:build` to verify no TS errors

### [ ] Step: Implement Orbital Cards visual

Build the "Orbital" visual component at `src/components/visuals/orbital-cards.tsx`:
- Central "nXus" hub element with subtle pulse/glow animation
- Cards arranged radially around the hub using CSS transforms/positioning
- Compact cards (icon + name), description hidden by default
- Hover: card scales up (1.15x), reveals description, gains glow shadow
- Non-hovered cards dim (opacity 0.7, scale 0.95x) when a sibling is hovered
- Connecting visual elements between hub and cards
- Responsive fallback to column layout on small screens
- Add required `@keyframes` to `src/styles.css`
- Uses `MiniApp` interface, existing `iconMap` pattern, theme CSS variables
- Run `npx nx run nxus-gateway:build` to verify no TS errors

### [ ] Step: Integrate visual switcher and update gateway page

- Create `src/components/visual-switcher.tsx`: small unobtrusive UI to toggle between 4 visuals (default + 3 new), stores preference in `localStorage` (`nxus-gateway-visual` key)
- Update `src/routes/index.tsx`:
  - Extract current `GatewayPage` content as the "default" visual (keep identical behavior)
  - Import all 3 new visual components and the switcher
  - Read stored visual preference, render selected visual
  - Render switcher overlay
- Run `npx nx run nxus-gateway:build` and `npx nx run nxus-gateway:test`
- Verify all 4 visuals render, switcher works, links navigate correctly
- Write implementation report to `{@artifacts_path}/report.md`
