# Introduction to Nxus

Nxus is a **local-first, node-based application ecosystem** designed to give you ultimate control over your tools and data.

## What is Nxus?

At its core, Nxus is more than just an app launcher or a dashboard. It's a unified platform that treats every application, command, and data point as a **Node** in a global, interconnected graph.

Imagine a system where:

- **Every tool is a node**: Apps like `curl`, `git`, or your custom scripts are entities you can relate, tag, and organize.
- **Supertags define behavior**: Apply a `#command` tag to a node, and it gains execution capabilities. Apply `#remote-repo`, and it knows how to clone itself.
- **Everything is local-first**: Your data lives on your machine, in an ultra-fast SQLite database, giving you 100% ownership and offline-first reliability.

## Core Philosophy

1. **Interoperability**: Tools should talk to each other. Nxus provides a common language (nodes and commands) for disparate tools to work together.
2. **Extensibility**: Adding a new tool should be as simple as writing a JSON manifest.
3. **Transparency**: Nxus aims to be "os-agnostic," providing a consistent experience across Windows, macOS, and Linux by abstracting system-level complexities.
4. **Agentic-Ready**: Nxus is built from the ground up to be easily understood and manipulated by AI agents, making it the perfect foundation for automated workflows.

## Key Features

- **Command Palette**: A lightning-fast interface to find and execute any tool or command.
- **Node Workbench**: A visual and tabular interface to explore your data graph, manage tags, and inspect relationships.
- **Workflow Engine**: Chain multiple commands together into powerful, automated sequences.
- **Live Streaming**: See real-time output from your terminal commands directly within the UI.

## Next Steps

Ready to dive in? Head over to the [Getting Started](getting-started.md) guide to set up Nxus on your local machine.
