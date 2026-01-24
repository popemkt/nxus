# Command Parameters Architecture

## Overview

Commands can declare **requirements** and **params** that are collected via a modal before execution.

- **Requirements**: Selectors on tagged items (e.g., pick an AI provider)
- **Params**: User input values (e.g., additional prompt text)

---

## Design Principles

### 1. Requirements ≠ Params

These are fundamentally different concepts:

| Concept         | Purpose                   | Example                         |
| --------------- | ------------------------- | ------------------------------- |
| **Requirement** | Select an app/item by tag | "Select an AI provider"         |
| **Param**       | Collect user input        | "Enter additional instructions" |

### 2. Required = No Default Value

Params without a `defaultValue` are automatically required. This simplifies the API:

```typescript
// Required param (no default)
{ name: 'projectPath', dataType: 'path' }

// Optional param (has default)
{ name: 'verbose', dataType: 'boolean', defaultValue: false }
```

### 3. Type-Safe dataType + uiType Pairs

Use discriminated unions to ensure type safety. Most dataTypes have fixed uiTypes:

| dataType  | Default uiType | Notes                               |
| --------- | -------------- | ----------------------------------- |
| `string`  | `input`        | Can override to `textarea`          |
| `number`  | (fixed)        | Always number input                 |
| `boolean` | (fixed)        | Always checkbox                     |
| `path`    | (fixed)        | Always folder picker                |
| `select`  | (fixed)        | Always dropdown, requires `options` |

Only `string` has a variable uiType. This keeps the type system simple.

### 4. Health Check Blocking for Requirements

When a requirement selects a tool (via tag), the modal:

1. Fetches all apps with that tag
2. Runs health checks on each (`checkCommand`)
3. Shows installed/not-installed badges
4. **Blocks execution** if selected item is not installed

---

## Schema Reference

### Requirements

```typescript
interface CommandRequirement {
  name: string; // Key in execution context
  tagId: number; // Tag ID to filter items by
  label?: string; // UI label
  description?: string;
}
```

### Params (Discriminated Union)

```typescript
// String params - can use input or textarea
interface StringParam {
  dataType: 'string';
  uiType: 'input' | 'textarea';
  name: string;
  label?: string;
  description?: string;
  defaultValue?: string;
}

// Number params
interface NumberParam {
  dataType: 'number';
  name: string;
  label?: string;
  description?: string;
  defaultValue?: number;
}

// Boolean params
interface BooleanParam {
  dataType: 'boolean';
  name: string;
  label?: string;
  description?: string;
  defaultValue?: boolean;
}

// Path params
interface PathParam {
  dataType: 'path';
  name: string;
  label?: string;
  description?: string;
  defaultValue?: string;
}

// Select params
interface SelectParam {
  dataType: 'select';
  options: string[]; // Required!
  name: string;
  label?: string;
  description?: string;
  defaultValue?: string;
}
```

---

## Usage Examples

### Generic Command with Requirements + Params

```typescript
const generateThumbnail: GenericCommand = {
  id: 'generate-thumbnail',
  name: 'Generate Thumbnail',
  icon: 'Image',
  needsTarget: 'app',

  // Select an AI provider by tag
  requirements: [
    {
      name: 'provider',
      tagId: SYSTEM_TAGS.AI_PROVIDER.id,
      label: 'AI Provider',
    },
  ],

  // Optional user input
  params: [
    {
      name: 'additionalPrompt',
      dataType: 'string',
      uiType: 'textarea',
      label: 'Additional Instructions',
    },
  ],

  execute: async (appId, _path, context) => {
    const provider = context?.requirements?.provider;
    const additionalPrompt = context?.params?.additionalPrompt;
    // ... use provider.value.cliCommand and additionalPrompt
  },
};
```

### App Command in manifest.json

```json
{
  "id": "deploy",
  "name": "Deploy",
  "icon": "Rocket",
  "mode": "execute",
  "command": "npm run deploy",
  "requirements": [{ "name": "server", "tagId": 20, "label": "Target Server" }],
  "params": [
    {
      "name": "environment",
      "dataType": "select",
      "options": ["staging", "production"]
    },
    { "name": "dryRun", "dataType": "boolean", "defaultValue": true }
  ]
}
```

---

## Execution Flow

```
1. User selects command from palette
2. Check: command.requirements || command.params?
   ├─ Yes → Open CommandParamsModal
   │        ├─ Fetch tagged items for requirements
   │        ├─ Run health checks
   │        ├─ User fills selections + params
   │        └─ Validate: all requirements installed, required params filled
   │             └─ Submit → execute(targetId, path, { requirements, params })
   └─ No  → execute(targetId) directly
```

---

## Related Files

- [command-params.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/types/command-params.ts) - Schemas
- [command-params-modal.tsx](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/components/features/command-params/command-params-modal.tsx) - Modal UI
- [registry.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/command-palette/registry.ts) - GenericCommand definition
