# Command Streaming Architecture

This document describes the architecture for streaming command execution logs to the frontend in real-time.

## Overview

The system allows you to execute terminal commands, scripts, and other long-running processes while streaming their output (stdout/stderr) to the frontend in real-time, displayed in a terminal-like interface.

## Architecture Components

### 1. **Backend Layer** (`services/command-execution.server.ts`)

- **`executeCommandServerFn`**: Server function that executes commands using Node.js `child_process.spawn()`
- **`useCommandStream`**: Hook for streaming command output (currently simulated, ready for WebSocket/SSE upgrade)

**Current Implementation:**

- Uses `spawn()` to execute commands
- Collects stdout/stderr
- Returns complete output after command finishes

**Production Upgrade Path:**

```typescript
// Future: WebSocket-based streaming
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  const child = spawn(command, args);

  child.stdout.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'stdout', message: data.toString() }));
  });

  child.stderr.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'stderr', message: data.toString() }));
  });

  child.on('close', (code) => {
    ws.send(JSON.stringify({ type: 'exit', code }));
    ws.close();
  });
});
```

### 2. **Frontend Hook** (`hooks/use-command-execution.ts`)

Manages command execution state and log collection:

```typescript
const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution({
  onComplete: () => console.log('Done!'),
  onError: (error) => console.error(error),
});

// Execute a command
await executeCommand('npm', ['install'], { cwd: '/path/to/project' });
```

**State Management:**

- `logs`: Array of log entries with timestamps and types
- `isRunning`: Boolean indicating if command is executing
- `executeCommand`: Function to start command execution
- `clearLogs`: Function to clear log history

### 3. **UI Component** (`components/app/command-log-viewer.tsx`)

Terminal-like log viewer with features:

- ✅ **Auto-scroll**: Automatically scrolls to bottom as new logs arrive
- ✅ **Manual scroll**: Disables auto-scroll when user scrolls up
- ✅ **Copy logs**: Copy all logs to clipboard
- ✅ **Expand/collapse**: Full-screen mode for detailed viewing
- ✅ **Color coding**: Different colors for stdout, stderr, errors, success
- ✅ **Live indicator**: Pulsing cursor when command is running

```typescript
<CommandLogViewer
  title="Installing Application"
  logs={logs}
  isRunning={isRunning}
  onClose={() => setShowLogs(false)}
/>
```

### 4. **Reusable Action Components** (`components/app/action-with-logs.tsx`)

Pre-built components for common patterns:

#### **Generic Action**

```typescript
<ActionWithLogs
  title="Build Project"
  description="Compile and bundle the application"
  buttonLabel="Start Build"
  command="npm"
  args={['run', 'build']}
  cwd="/path/to/project"
  onComplete={() => console.log('Build complete!')}
/>
```

#### **Installation Action**

```typescript
<InstallActionWithLogs
  appName="my-app"
  repoUrl="https://github.com/user/repo.git"
  onComplete={(path) => console.log(`Installed at ${path}`)}
/>
```

#### **Script Execution**

```typescript
<ScriptActionWithLogs
  scriptName="Deploy Script"
  scriptPath="./deploy.sh"
  scriptArgs={['production']}
  cwd="/path/to/project"
/>
```

## Usage Examples

### Example 1: Simple Command Execution

```typescript
import { useCommandExecution } from '@/hooks/use-command-execution'
import { CommandLogViewer } from '@/components/app/command-log-viewer'

function MyComponent() {
  const { logs, isRunning, executeCommand } = useCommandExecution()

  const handleRun = async () => {
    await executeCommand('ls', ['-la'], { cwd: '/home/user' })
  }

  return (
    <div>
      <button onClick={handleRun}>List Files</button>
      <CommandLogViewer logs={logs} isRunning={isRunning} />
    </div>
  )
}
```

### Example 2: Installation with Progress

```typescript
import { InstallActionWithLogs } from '@/components/app/action-with-logs'

function AppInstaller({ app }) {
  return (
    <InstallActionWithLogs
      appName={app.name}
      repoUrl={app.path}
      onComplete={(path) => {
        // Update app state
        appStateService.markAsInstalled(app.id, path)
      }}
      onError={(error) => {
        // Show error notification
        toast.error(error.message)
      }}
    />
  )
}
```

### Example 3: Multi-step Process

```typescript
function DeploymentFlow() {
  const { logs, isRunning, executeCommand } = useCommandExecution()

  const handleDeploy = async () => {
    // Step 1: Install dependencies
    await executeCommand('npm', ['install'])

    // Step 2: Run tests
    await executeCommand('npm', ['test'])

    // Step 3: Build
    await executeCommand('npm', ['run', 'build'])

    // Step 4: Deploy
    await executeCommand('./deploy.sh', ['production'])
  }

  return (
    <div>
      <button onClick={handleDeploy}>Deploy</button>
      <CommandLogViewer
        title="Deployment Pipeline"
        logs={logs}
        isRunning={isRunning}
      />
    </div>
  )
}
```

## Log Entry Types

```typescript
type LogEntry = {
  timestamp: number;
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'success';
  message: string;
};
```

- **stdout**: Standard output (white text)
- **stderr**: Standard error (orange text)
- **info**: Informational messages (blue text)
- **error**: Error messages (red text)
- **success**: Success messages (green text)

## Upgrading to Real-time Streaming

The current implementation simulates streaming by splitting output into lines. For true real-time streaming:

### Option 1: Server-Sent Events (SSE)

**Pros:**

- Simple to implement
- Built-in browser support
- Automatic reconnection
- Works over HTTP

**Cons:**

- One-way communication only
- Limited browser connection pool

**Implementation:**

```typescript
// Server
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const child = spawn('npm', ['install']);

      child.stdout.on('data', (data) => {
        const message = `data: ${JSON.stringify({ type: 'stdout', message: data.toString() })}\n\n`;
        controller.enqueue(encoder.encode(message));
      });

      child.on('close', () => {
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Client
const eventSource = new EventSource('/api/execute-command');
eventSource.onmessage = (event) => {
  const log = JSON.parse(event.data);
  addLog(log);
};
```

### Option 2: WebSocket

**Pros:**

- Bi-directional communication
- Lower latency
- Can send commands to running process

**Cons:**

- More complex setup
- Requires WebSocket server

**Implementation:**

```typescript
// Server
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const { command, args } = JSON.parse(message);
    const child = spawn(command, args);

    child.stdout.on('data', (data) => {
      ws.send(JSON.stringify({ type: 'stdout', message: data.toString() }));
    });
  });
});

// Client
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
  const log = JSON.parse(event.data);
  addLog(log);
};
ws.send(JSON.stringify({ command: 'npm', args: ['install'] }));
```

## Best Practices

1. **Always show logs for long-running commands** (> 5 seconds)
2. **Provide clear feedback** about what's happening
3. **Allow users to expand logs** for detailed inspection
4. **Enable log copying** for debugging and sharing
5. **Color-code different log types** for quick scanning
6. **Auto-scroll by default** but allow manual scrolling
7. **Show completion status** (success/error) clearly
8. **Persist logs** until user explicitly clears them

## Security Considerations

⚠️ **Important**: Command execution is powerful and potentially dangerous.

1. **Validate all inputs** before executing commands
2. **Sanitize user-provided arguments** to prevent injection
3. **Restrict allowed commands** to a whitelist
4. **Run commands with limited permissions**
5. **Set timeouts** to prevent infinite execution
6. **Limit concurrent executions** to prevent resource exhaustion

Example validation:

```typescript
const ALLOWED_COMMANDS = ['git', 'npm', 'node', 'pnpm'];

function validateCommand(command: string) {
  if (!ALLOWED_COMMANDS.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }
}
```

## Future Enhancements

- [ ] WebSocket/SSE implementation for true streaming
- [ ] Command cancellation/termination
- [ ] Interactive command input (for prompts)
- [ ] Log filtering and search
- [ ] Log export (download as file)
- [ ] Syntax highlighting for different log types
- [ ] Performance metrics (execution time, memory usage)
- [ ] Command history and replay
- [ ] Parallel command execution with multiple log viewers
