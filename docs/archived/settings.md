# Settings System

This document describes the settings management system in Nxus, including global settings, app configurations, and keyboard shortcuts.

## Overview

The Settings screen (`/settings`) provides a centralized location for:

- **General settings**: Theme, default paths
- **Keyboard shortcuts**: Configurable keybindings
- **App configurations**: Tool-specific settings (API keys, URLs)

## Accessing Settings

1. **Settings button**: Click the gear icon in the header (next to theme toggle)
2. **Command Palette**: Press `Ctrl+Shift+P` and type "Settings"

## Settings Structure

### General Settings

- **Theme**: Light, Dark, or System (syncs with OS)
- **Default Install Path**: Default location for new installations

### Keyboard Shortcuts

Customize global shortcuts:

- **Command Palette**: Default `Ctrl+Shift+P`

To edit a shortcut:

1. Click the shortcut button
2. Press your desired key combination
3. Shortcut updates immediately

### App Configurations

For tools with `configSchema` in their manifest:

- Shows all required/optional configuration fields
- Saves automatically on change
- Persisted to `localStorage`

Example: Claude Code GLM API keys, base URLs

## File Structure

```
src/
├── stores/
│   └── settings.store.ts        # Global settings + keybindings
├── routes/
│   └── settings.tsx             # Settings page UI
└── services/state/
    └── tool-config-state.ts     # App-specific configs
```

## Adding Configurable Settings to an App

In your app's `manifest.json`:

```json
{
  "type": "tool",
  "configSchema": {
    "fields": [
      {
        "key": "apiKey",
        "label": "API Key",
        "type": "password",
        "required": true,
        "placeholder": "sk-..."
      },
      {
        "key": "baseUrl",
        "label": "Base URL",
        "type": "text",
        "required": false,
        "defaultValue": "https://api.example.com"
      }
    ]
  }
}
```

The app will automatically appear in Settings → App Configurations.

## State Management

### Global Settings (`settings.store.ts`)

- Uses Zustand with `persist` middleware
- Stored in `localStorage` as `nxus-settings`
- Includes general settings and keybindings

### Tool Configs (`tool-config-state.ts`)

- Separate store for app-specific configs
- **Never cleared** by refresh actions
- Stored in `localStorage` as `tool-config-storage`

## Keybinding System

### Helper Functions

`parseKeybinding(binding: string)`: Parse a keybinding string like "Ctrl+Shift+P" into modifiers and key.

`matchesKeybinding(event: KeyboardEvent, binding: string)`: Check if an event matches a keybinding.

### Usage Example

```typescript
import { useSettingsStore, matchesKeybinding } from '@/stores/settings.store'

const commandPaletteBinding = useSettingsStore(
  (s) => s.keybindings.commandPalette,
)

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (matchesKeybinding(e, commandPaletteBinding)) {
      e.preventDefault()
      // Open palette
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [commandPaletteBinding])
```

## Common Pitfalls

### Infinite Re-renders

**Problem**: Using `?? {}` in Zustand selectors creates new object references.

```typescript
// ❌ BAD - Creates new object every render
const config = useStore((s) => s.configs[id] ?? {})

// ✅ GOOD - Use stable reference
const EMPTY_CONFIG = {}
const config = useStore((s) => s.configs[id]) || EMPTY_CONFIG
```

### Selector Stability

**Problem**: Selecting functions from Zustand actions.

```typescript
// ❌ BAD - New function reference every time
const setConfig = useStore((s) => s.actions.setConfig)

// ✅ GOOD - Use getState() for imperative actions
const handleChange = () => {
  useStore.getState().actions.setConfig(id, key, value)
}
```

## Future Enhancements

- Import/export settings
- Settings profiles
- Per-instance configurations
- Advanced keybinding conflicts detection
