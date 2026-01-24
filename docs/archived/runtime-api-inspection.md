# Runtime API Inspection (The "Probe" Trick)

> "When static analysis fails, ask the code itself."

This technique allows you to discover the _actual_ methods and properties available on an object at runtime, bypassing incorrect or missing TypeScript definitions. This is useful when documentation is outdated, types are mismatched, or source code is hard to locate in `node_modules`.

## The Concept

Static analysis (reading code/types) tells you what the code _should_ do. Runtime inspection (running code) tells you what the code _actually_ does. By running a minimal "probe" script, you can print the shape of opaque objects.

## The Recipe

### 1. Create a Probe Test

Create a temporary file like `src/probe.test.ts`. We use a test file because test runners (like Vitest) effectively handle TypeScript compilation and module resolution without extra configuration.

```typescript
// src/probe.test.ts
import { somethingUnknown } from 'external-library';
import { describe, it } from 'vitest';

describe('API Probe', () => {
  it('reveals object structure', () => {
    // 1. Instantiate or access the target object
    const instance = somethingUnknown();

    // 2. Log what it owns directly
    console.log('-> Keys:', Object.keys(instance));

    // 3. Log what it inherits (methods often live on the prototype)
    console.log(
      '-> Prototype Keys:',
      Object.getOwnPropertyNames(Object.getPrototypeOf(instance)),
    );
  });
});
```

### 2. Run the Probe

Run the test in isolation.

```bash
npx vitest run src/probe.test.ts
```

### 3. Analyze Output

The console will print the actual API surface.

**Example from `createServerFn` debugging:**
I suspected `.validator()` existed, but TypeScript errored.

```text
stdout | src/probe.test.ts > probe > logs keys
Builder keys: [ 'options', 'middleware', 'inputValidator', 'handler' ]
```

**Result:** The key `inputValidator` was clearly visible effectively acting as "dynamic documentation."

## Why use a Test Runner (Vitest)?

You could use `console.log` in your app, but:

1.  **Noise**: App logs are cluttered.
2.  **Context**: You might need to trigger a specific app state to run that line.
3.  **Speed**: Tests run instantly and in isolation.
4.  **Setup**: Tesy runners handle TS config/imports automatically, unlike running `node script.js` which might fail on ES Modules/TypeScript syntax.
