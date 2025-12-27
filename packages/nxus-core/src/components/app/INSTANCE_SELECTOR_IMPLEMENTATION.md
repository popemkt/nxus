# Instance Selector Implementation Summary

## ✅ What We Built

### 1. **InstanceSelector Component** (`instance-selector.tsx`)

A smart component that manages instance selection with two modes:

#### Compact Mode (Default)

- **Super minimal**: Just a single row showing the selected instance path
- Small "Instance" label above
- Folder icon + path (truncated) + instance count (if multiple)
- Click anywhere to expand
- **No "Add" button** - must expand first to add

#### Expanded Mode

- Full Card UI with header showing instance count
- List of all instances with radio-style selection
- Selected instance highlighted with checkmark and primary color
- Click any instance to select it → **auto-collapses back to compact**
- "Add Another Instance" button only visible in this mode
- Collapse button in header to manually close

### 2. **InstanceActionsPanel Component** (`instance-actions-panel.tsx`)

Dynamic actions panel that lives in the **right sidebar**:

#### Features

- Shows actions for the currently selected instance
- **Type-specific actions** based on `AppType`:
  - `remote-repo`: Install Deps, Build, Start Dev, Git Pull
  - `typescript`: Build, Start
  - `html`: Open in Browser
  - `script-tool`: Run Script
- Quick actions: Open Folder, Terminal
- Danger zone: Remove Instance (with delete from disk option)

### 3. **Integration** (`apps.$appId.tsx`)

Updated the app detail page:

- **Left column (main)**: InstanceSelector replaces old InstallationsCard
- **Right column (sidebar)**: InstanceActionsPanel at the top
- State management: `selectedInstance` tracks current selection
- Auto-selects first instance on load

---

## 🎨 UX Flow

```
1. Page loads → First instance auto-selected
                ↓
2. Compact mode shows: [📁 ~/path/to/instance  1/3  ⌄]
                ↓
3. User clicks → Expands to show all instances
                ↓
4. User picks instance → Auto-collapses back to compact
                ↓
5. Right sidebar updates → Shows actions for selected instance
```

---

## 🔑 Key Design Decisions

1. **Compact by default**: Most users work with one instance, so minimize UI clutter
2. **Expand to choose**: Multi-instance users can easily switch
3. **Auto-collapse after selection**: Reduces cognitive load, keeps UI clean
4. **Add only in expanded mode**: Prevents accidental additions, encourages deliberate action
5. **Type-specific actions**: Different item types get different actions (repos vs notes vs SPAs)
6. **Sidebar placement**: Actions are contextual to the selected instance, so they live in the sidebar

---

## 📁 Files Changed

### New Files

- `/components/app/instance-selector.tsx` - Main selector component
- `/components/app/instance-actions-panel.tsx` - Dynamic actions panel
- `/components/app/INSTANCE_SELECTOR_UX.md` - Original UX design doc
- `/components/app/instance-selector-mockup.html` - V1 mockup
- `/components/app/instance-selector-v2-mockup.html` - V2 two-column mockup

### Modified Files

- `/routes/apps.$appId.tsx` - Integrated new components

### Unchanged (Still Available)

- `/components/app/installations-card.tsx` - Old component (can be removed later)

---

## 🚀 Next Steps (Optional Enhancements)

1. **Command Execution Integration**: Wire up the `onRunCommand` handler to actually execute commands with streaming logs
2. **Custom Actions**: Allow users to define their own actions per instance type
3. **Status Indicators**: Show git status, dependency status, etc. in the actions panel
4. **Keyboard Navigation**: Add keyboard shortcuts for switching instances
5. **Multi-select**: Allow running actions on multiple instances at once
6. **Instance Metadata**: Add tags, notes, or custom names to instances

---

## 🎯 User Benefits

- **Cleaner UI**: Compact mode reduces visual clutter
- **Faster Switching**: One click to expand, one click to switch
- **Contextual Actions**: Right sidebar shows relevant actions for selected instance
- **Type Awareness**: Different item types get appropriate actions
- **No Accidental Adds**: Must expand first, reducing mistakes
