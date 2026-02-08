# @nxus/ui

Shared UI components for Nxus applications. Built on top of shadcn/ui with Tailwind CSS.

## Installation

```bash
pnpm add @nxus/ui
```

## Dependencies

- `react` / `react-dom` - Peer dependencies
- `tailwindcss` - Styling (peer)
- `class-variance-authority` - Component variants
- `framer-motion` - Animations (for DecodeText, GlitchText)

## Usage

Import components from the main entry point:

```tsx
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Badge,
  cn,
} from '@nxus/ui'

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Card</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Enter text..." />
        <Button>Submit</Button>
        <Badge>Status</Badge>
      </CardContent>
    </Card>
  )
}
```

## Components

### Layout & Container

| Component | Description |
|-----------|-------------|
| `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription` | Card container with sections |
| `Separator` | Visual divider |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Tabbed interface |

### Form Controls

| Component | Description |
|-----------|-------------|
| `Button` | Button with variants (default, destructive, outline, secondary, ghost, link) |
| `Input` | Text input field |
| `Textarea` | Multi-line text input |
| `Checkbox` | Checkbox input |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `SelectGroup` | Dropdown select |
| `Combobox`, `ComboboxInput`, `ComboboxContent`, `ComboboxItem`, ... | Searchable select with autocomplete |
| `Label` | Form field label |

### Form Layout

| Component | Description |
|-----------|-------------|
| `Field`, `FieldLabel`, `FieldContent`, `FieldDescription`, `FieldError` | Form field wrapper with label and validation |
| `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldSeparator`, `FieldTitle` | Group multiple fields |
| `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `InputGroupTextarea` | Input with prefix/suffix addons |

### Feedback & Status

| Component | Description |
|-----------|-------------|
| `Badge` | Status indicator with variants |
| `LoadingSpinner` | Spinning loader |
| `LoadingDots` | Animated dots loader |
| `Skeleton`, `SkeletonText`, `SkeletonButton`, `SkeletonBadge`, `SkeletonIcon` | Loading placeholders |

### Overlays & Dialogs

| Component | Description |
|-----------|-------------|
| `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` | Confirmation dialog |
| `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, ... | Context menu / dropdown |

### Effects

| Component | Description |
|-----------|-------------|
| `DecodeText` | Animated text decode effect |
| `GlitchText` | Animated glitch text effect |

## Utilities

### cn (className merger)

```typescript
import { cn } from '@nxus/ui'

// Merge Tailwind classes with conflict resolution
cn('px-2 py-1', 'px-4') // → 'py-1 px-4'
cn('text-red-500', condition && 'text-blue-500')
```

## Button Variants

```tsx
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

## Badge Variants

```tsx
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>
```

## Tailwind Configuration

### Tailwind v4 (with `@tailwindcss/vite`)

When using Tailwind v4 with the Vite plugin, add `@source` directives to your main CSS file to scan external packages for Tailwind classes:

```css
/* styles.css */
@import 'tailwindcss';

/* Scan external packages for Tailwind classes */
@source "../../nxus-ui/src/**/*.{ts,tsx}";
```

> **Important for new mini apps**: If you create a new package that uses `@nxus/ui` components, you must add a `@source` directive pointing to your package in the consuming app's CSS file. Otherwise, Tailwind won't generate CSS for classes used in your package.

### Tailwind v3 (with config file)

For Tailwind v3, include the UI package in your config:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@nxus/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  // ...
}
```
