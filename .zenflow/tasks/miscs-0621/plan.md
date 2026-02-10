# Quick change

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

This is a quick change workflow for small or straightforward tasks where all requirements are clear from the task description.

### Your Approach

1. Proceed directly with implementation
2. Make reasonable assumptions when details are unclear
3. Do not ask clarifying questions unless absolutely blocked
4. Focus on getting the task done efficiently

This workflow also works for experiments when the feature is bigger but you don't care about implementation details.

If blocked or uncertain on a critical decision, ask the user for direction.

---

## Workflow Steps

### [x] Step: Implementation
<!-- chat-id: b759120f-549c-475e-b93c-0b08c39e42a2 -->

Implement the task directly based on the task description.

1. Make reasonable assumptions for any unclear details
2. Implement the required changes in the codebase
3. Add and run relevant tests and linters if applicable
4. Perform basic manual verification if applicable

Save a brief summary of what was done to `{@artifacts_path}/report.md` if significant changes were made.

### [x] Step: Tweak graph view
<!-- chat-id: 30c03885-823f-4e5c-a02d-bbb1d97541af -->

in workbench, now can we make the node inspection panel closable. And in the graph view of both the 2d and 3d graph will take up the whole space, with the inspection panel on top of the graph, so that when i click a node, the graph's viewport (or dimensions aren't resized). and i can close the panel whenever i want. This will also unify the dimension behavior of both 2d and 3d graphs, as they're now different (3d takes a lot of space and seems to not have inspection panel on click, 2d have panel always)

### [x] Step: tests and e2e tests
<!-- chat-id: ea2dd3d1-2d09-4151-9af0-9b511b279f27 -->

Based on the tweaks we did, add tests and e2e tests if necessary

### [x] Step: fix pr comments
<!-- chat-id: 242d59d4-1047-49a4-bf1c-fbf387fa8d84 -->

Check this github pr and see if the comments are legit, if yes fix them https://github.com/popemkt/nxus/pull/42