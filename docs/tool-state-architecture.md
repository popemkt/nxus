# Tool State Architecture

## Overview

Tools have two independent state checks that determine command visibility and behavior:

```
┌──────────────────┐     ┌───────────────────┐
│  Liveness Check  │     │  Readiness Check  │
│  (Health State)  │     │  (Config State)   │
├──────────────────┤     ├───────────────────┤
│ Is installed?    │     │ Is configured?    │
│ What version?    │     │ Has API keys?     │
│ Cleared on       │     │ NEVER cleared     │
│ refresh ✓        │     │ on refresh ✗      │
└────────┬─────────┘     └─────────┬─────────┘
         │                         │
         └────────────┬────────────┘
                      ▼
              ┌──────────────┐
              │Command State │
              ├──────────────┤
              │ • Disabled   │ ← Liveness failed
              │ • Warning ⚠️  │ ← Readiness failed
              │ • Ready ✓    │ ← Both pass
              └──────────────┘
```

## State Stores

| Store                 | File                                                                                                                 | Cleared on Refresh? | Purpose                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `item-status-storage` | [item-status-state.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/state/item-status-state.ts) | ✅ Yes              | Installation status (See [Item Status Arch](./item-status-architecture.md)) |
| `tool-config-storage` | [tool-config-state.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/state/tool-config-state.ts) | ❌ Never            | API keys, URLs, user config                                                 |

## Command States

| State               | Condition                     | UI               | User Action        |
| ------------------- | ----------------------------- | ---------------- | ------------------ |
| **Disabled**        | Liveness failed               | Grayed out       | Cannot click       |
| **Needs Attention** | Liveness OK, Readiness failed | Amber warning ⚠️ | Click to configure |
| **Ready**           | Both pass                     | Normal           | Execute normally   |

## Schema Extensions

### ConfigFieldSchema

```typescript
{
  key: string       // e.g., "ANTHROPIC_API_KEY"
  label: string     // e.g., "Z.AI API Key"
  type: 'text' | 'password' | 'url'
  required?: boolean
  defaultValue?: string
  placeholder?: string
}
```

### CommandModeSchema

Added `configure` mode that opens [ConfigModal](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/components/app/config-modal.tsx).

## Files Changed

| File                                                                                                                   | Change                                 |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [tool-config-state.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/state/tool-config-state.ts)   | NEW - Persistent config store          |
| [config-modal.tsx](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/components/app/config-modal.tsx)           | NEW - Configuration modal              |
| [app.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/types/app.ts)                                        | Added ConfigFieldSchema, configSchema  |
| [app-actions-panel.tsx](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/components/app/app-actions-panel.tsx) | Command state logic + modal            |
| [claude-code-glm.json](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps/claude-code-glm.json)        | Added configSchema + configure command |
