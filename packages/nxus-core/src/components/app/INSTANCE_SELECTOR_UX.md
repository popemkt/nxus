# Instance Selector - UX Design Document

## Overview

Reimagining the "Installations" feature as an **Instance Selector** - a more intuitive and action-focused interface for managing different instances of apps/items.

## Key Terminology Changes

| Old Term           | New Term          | Rationale                              |
| ------------------ | ----------------- | -------------------------------------- |
| Installation       | Instance          | More generic, works for non-repo types |
| Installations Card | Instance Selector | Action-oriented naming                 |
| Install Path       | Instance Path     | Consistent with new terminology        |

---

## Design Philosophy

### 1. **Compact by Default, Detailed on Demand**

Users often work with a single instance. The compact mode prioritizes this workflow while allowing expansion for advanced management.

### 2. **Contextual Actions**

Different instance types require different actions. A repo might need `npm install`, while a script might need `chmod +x`.

### 3. **Progressive Disclosure**

Start simple, reveal complexity only when needed.

---

## Component Structure

```
┌─────────────────────────────────────────────────────────┐
│  InstanceSelector (Main Container)                       │
│  ├── CompactView (Default: Single selected instance)    │
│  │   ├── InstanceIndicator (Icon + Name + Status)       │
│  │   ├── QuickActions (Primary actions inline)          │
│  │   └── ExpandToggle (Switch to full mode)             │
│  │                                                       │
│  └── FullView (Expanded: All instances + details)       │
│      ├── InstanceList                                    │
│      │   └── InstanceItem × N                           │
│      │       ├── InstanceInfo (Path, Date, Type)        │
│      │       ├── SelectRadio (Pick active)              │
│      │       └── ItemActions (Open, Delete, etc.)       │
│      │                                                   │
│      ├── ActionPanel (Selected instance actions)        │
│      │   ├── ConfiguredActions (npm install, build)     │
│      │   └── QuickActions (Open folder, Terminal)       │
│      │                                                   │
│      └── AddInstanceButton                               │
└─────────────────────────────────────────────────────────┘
```

---

## UI States

### State 1: No Instances (Empty State)

```
┌────────────────────────────────────────┐
│  ⬡  No instances yet                   │
│                                         │
│  Add your first instance to get started │
│                                         │
│  [+ Add Instance]                       │
└────────────────────────────────────────┘
```

### State 2: Compact Mode (Single Instance Selected)

```
┌────────────────────────────────────────────────────────────┐
│  📁 ~/Projects/my-app                     [⟳] [📂] [⋮]   │
│     TypeScript • Installed Dec 25                     [↓]  │
└────────────────────────────────────────────────────────────┘
      │                                               │
      └─ Path + metadata                    Expand button
```

**Components:**

- **Path Display**: Truncated with ellipsis, full path on hover
- **Quick Actions**:
  - ⟳ Refresh/Sync
  - 📂 Open folder
  - ⋮ More actions menu
- **Expand Toggle**: Little chevron to switch to full mode

### State 3: Full Mode (Multiple Instances)

```
┌────────────────────────────────────────────────────────────┐
│  Instances (3)                                        [↑]  │
├────────────────────────────────────────────────────────────┤
│  ◉ ~/Projects/my-app                            [📂] [🗑] │
│    Active • Installed Dec 25, 2024                         │
├────────────────────────────────────────────────────────────┤
│  ○ ~/Work/my-app-fork                           [📂] [🗑] │
│    Installed Dec 20, 2024                                  │
├────────────────────────────────────────────────────────────┤
│  ○ /tmp/my-app-test                             [📂] [🗑] │
│    Installed Dec 27, 2024                                  │
├────────────────────────────────────────────────────────────┤
│                         [+ Add Instance]                   │
├────────────────────────────────────────────────────────────┤
│  ACTIONS FOR ACTIVE INSTANCE                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ 📦 npm      │ │ 🔨 Build    │ │ ▶ Start     │          │
│  │   install   │ │             │ │             │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                             │
│  [📂 Open Folder] [💻 Open Terminal] [🔗 View in IDE]     │
└────────────────────────────────────────────────────────────┘
```

---

## Action System

### Predefined Actions (Per Type)

| Type          | Primary Actions             | Secondary Actions |
| ------------- | --------------------------- | ----------------- |
| `remote-repo` | npm install, Build, Start   | Pull, Push, Reset |
| `typescript`  | Build, Start, Test          | Lint, Format      |
| `html`        | Open in Browser             | -                 |
| `script-tool` | Run Script, Make Executable | -                 |

### Action Configuration Schema

```typescript
interface InstanceAction {
  id: string
  label: string
  icon: IconType
  command?: string // e.g., "npm install"
  handler?: 'open-folder' | 'open-terminal' | 'open-browser' | 'custom'
  showLogs?: boolean // Stream command output
  requiresConfirmation?: boolean
  enabledWhen?: {
    hasPackageJson?: boolean
    hasFile?: string
    platform?: Platform[]
  }
}

interface InstanceTypeConfig {
  type: AppType
  primaryActions: InstanceAction[]
  secondaryActions: InstanceAction[]
}
```

### Example: Remote Repo Actions

```typescript
const remoteRepoActions: InstanceTypeConfig = {
  type: 'remote-repo',
  primaryActions: [
    {
      id: 'npm-install',
      label: 'Install Dependencies',
      icon: PackageIcon,
      command: 'npm install',
      showLogs: true,
      enabledWhen: { hasPackageJson: true },
    },
    {
      id: 'build',
      label: 'Build',
      icon: HammerIcon,
      command: 'npm run build',
      showLogs: true,
      enabledWhen: { hasFile: 'package.json' },
    },
    {
      id: 'start',
      label: 'Start',
      icon: PlayIcon,
      command: 'npm run dev',
      showLogs: true,
    },
  ],
  secondaryActions: [
    {
      id: 'open-folder',
      label: 'Open Folder',
      icon: FolderOpenIcon,
      handler: 'open-folder',
    },
    {
      id: 'open-terminal',
      label: 'Open Terminal',
      icon: TerminalIcon,
      handler: 'open-terminal',
    },
  ],
}
```

---

## Interaction Flows

### Flow 1: Switch Active Instance (Compact Mode)

```
User clicks compact selector
    ↓
Dropdown appears with all instances
    ↓
User clicks different instance
    ↓
Compact view updates to show new active
    ↓
Actions panel refreshes for new instance
```

### Flow 2: Run Action on Instance

```
User clicks action button (e.g., "npm install")
    ↓
Action panel slides out showing log viewer
    ↓
Command streams output in real-time
    ↓
On completion: Success/Error state shown
    ↓
Panel auto-collapses after 3s (success) or stays (error)
```

### Flow 3: Add New Instance

```
User clicks "+ Add Instance"
    ↓
Dialog: Configure installation path
    ↓
Clone/Copy operation begins
    ↓
Progress shown with streaming logs
    ↓
Success: New instance added, becomes active
```

---

## Visual Design Tokens

### Colors

- **Active Instance**: `var(--primary)` border/accent
- **Inactive Instance**: `var(--muted)` background
- **Action Button (Idle)**: `var(--secondary)`
- **Action Button (Running)**: `var(--primary)` with pulse animation
- **Action Button (Success)**: `var(--success)` / green
- **Action Button (Error)**: `var(--destructive)` / red

### Spacing

- Instance item padding: `12px 16px`
- Action button gap: `8px`
- Section gap: `16px`

### Typography

- Instance path: `font-mono text-sm`
- Metadata: `text-xs text-muted-foreground`
- Action label: `text-sm font-medium`

---

## Component API

```tsx
interface InstanceSelectorProps {
  appId: string
  appType: AppType

  // Control compact/full mode externally
  defaultMode?: 'compact' | 'full'

  // Actions configuration
  actions?: InstanceTypeConfig

  // Callbacks
  onInstanceChange?: (instanceId: string) => void
  onActionComplete?: (actionId: string, result: ActionResult) => void

  // Installation
  canAddInstance?: boolean
  onAddInstance?: () => void
}
```

---

## Implementation Plan

### Phase 1: Core Refactoring

1. [ ] Create `InstanceSelector` component
2. [ ] Rename `InstalledAppRecord` to `Instance`
3. [ ] Add `activeInstanceId` to state
4. [ ] Create compact mode view

### Phase 2: Action System

1. [ ] Define action configuration schema
2. [ ] Create `ActionButton` component with states
3. [ ] Integrate with command execution server
4. [ ] Add log streaming support

### Phase 3: Type-Specific Actions

1. [ ] Define actions for each app type
2. [ ] Implement action enablement logic
3. [ ] Add custom action support

### Phase 4: Polish

1. [ ] Add animations and transitions
2. [ ] Implement keyboard navigation
3. [ ] Add tooltips and help text
4. [ ] Mobile responsive design

---

## Open Questions

1. **Persistence**: Should the active instance be persisted, or reset on app reload?
2. **Multi-select**: Should users be able to run actions on multiple instances?
3. **Custom Actions**: Allow users to define their own actions?
4. **Sync Status**: Show git status, outdated dependencies, etc.?
