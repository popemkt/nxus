---
description: Add a new item (app/tool) to the registry
---

1. Ask the user for the official documentation URL(s) for the item they want to add.
2. If a URL is provided, use `read_browser_page` or `read_url_content` to read the documentation and understand how to install and use the item.
3. Propose a configuration for the new item. This should include:
   - The item's name (slug).
   - Installation commands/checks.
   - Relevant commands for the user (e.g., start, build, dev).
   - Any necessary configuration fields.
   - Ask the user to confirm this proposal or provide clarifications.
4. Once the user confirms, generate the necessary files or updates. This typically involves:
   - Creating or updating a JSON file in `packages/nxus-core/src/data/apps/` (or appropriate registry location).
   - Ensuring the item follows the schema defined in `packages/nxus-core/src/types/`.
