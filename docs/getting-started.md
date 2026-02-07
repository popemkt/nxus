# Getting Started with Nxus

Setting up Nxus is straightforward. Follow these steps to get your local environment running.

## Prerequisites

- **Node.js**: Version 20 or higher is recommended.
- **pnpm**: We use pnpm for package management.
- **Git**: Required for cloning repositories and installing apps.
- **SQLite**: The database is managed automatically, but having a viewer like `sqlite3` or a GUI extension can be helpful for debugging.

## Installation

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/popemkt/nxus.git
   cd nxus
   ```

2. **Install Dependencies**:

   ```bash
   pnpm install
   ```

3. **Initialize the Database**:
   Nxus uses a local SQLite database. To set up the schema and seed initial data, run:

   ```bash
   pnpm db:migrate
   ```

4. **Start the Development Server**:
   ```bash
   pnpm dev
   ```
   This starts all three mini-apps simultaneously:
   - **Gateway** at `http://localhost:3001/` — landing page with links to all apps
   - **Core** at `http://localhost:3000/core` — main app management interface
   - **Workbench** at `http://localhost:3002/workbench` — node browser and graph explorer

   To start a single app:
   ```bash
   pnpm dev:gateway    # Gateway only
   pnpm dev:core       # Core only
   pnpm dev:workbench  # Workbench only
   ```

## First Steps

### 1. The Command Palette

Press `Cmd+K` (or `Ctrl+K`) to open the Command Palette. This is your primary way to interact with Nxus. Type the name of an app or a command to see results.

### 2. Explore the Node Workbench

Navigate to the "Nodes" or "Workbench" section in the UI. Here you can see all the applications, tags, and commands currently registered in your system.

### 3. Install your first "App"

Find an item with the `#remote-repo` tag (like `logseq` or `nxus` itself) and look for the **Install** command. This will clone the repository to your local machine using the configuration defined in its manifest.

## Troubleshooting

- **Database Errors**: If you encounter issues with data loading, try resetting the database: `pnpm db:reset` (Warning: this will delete local data).
- **Port Conflicts**: The apps use ports 3000 (core), 3001 (gateway), and 3002 (workbench). You can change ports in each app's `package.json`.

---

For more detailed information on specific features, check out the [Architecture Overview](architecture/overview.md) or the [Creating Apps](guides/creating-apps.md) guide.
