# AutoCoder User Guide

AutoCoder is an AI-powered code generator that uses a two-agent pattern to build applications feature by feature.

## Prerequisites

- **Claude Code CLI**: Required for AI interactions.
- **Python 3**: Required for the automation scripts.

## Getting Started

### Web UI (Recommended)

{{command:run-ui}}

This launches the React-based web UI at `http://localhost:5173` with:

- Project selection and creation
- Kanban board view of features
- Real-time agent output streaming
- Start/pause/stop controls

### CLI Mode

{{command:run-cli}}

The start script will:

1. Check if Claude CLI is installed
2. Verify authentication
3. Create a Python virtual environment
4. Install dependencies
5. Launch the main menu

## How It Works

### Two-Agent Pattern

1. **Orchestrator Agent**: Plans features and manages the project
2. **Builder Agent**: Implements individual features

### Feature Management

- Features are tracked in a Kanban board
- Each feature can be started, paused, or stopped
- Real-time progress updates via WebSocket

## Troubleshooting

- Ensure Claude Code is authenticated: `claude login`
- Run the helper to fix common issues: `npx @z_ai/coding-helper`
