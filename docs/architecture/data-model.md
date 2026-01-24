# Data Model: Nodes and Supertags

Nxus utilizes a **node-based graph architecture** inspired by systems like Tana. This model allows for incredible flexibility in how data is structured, queried, and related.

## What is a Node?

In Nxus, everything is a **Node**. An application, a category, a tag, a command, and even a specific instance of a tool are all represented as nodes in the database.

A node consists of:

- **ID**: A unique identifier.
- **Name**: A human-readable display name.
- **Properties**: A set of key-value pairs (stored as JSON) that define the node's specific data.
- **Supertags**: A collection of tags that define what the node _is_ and what it can _do_.

## The Power of Supertags

Supertags are the core of the Nxus type system. Unlike traditional tags that are just for organization, supertags in Nxus are **functional**.

- **Inheritance**: Nodes "inherit" properties and behaviors from their supertags.
- **Behavioral Mapping**: The system uses supertags to determine how to render a node in the UI and what actions are available for it.

### Common Core Supertags

| Supertag       | Description                            | Available Actions           |
| :------------- | :------------------------------------- | :-------------------------- |
| `#app`         | Represents a software application.     | Open, Uninstall, Configure  |
| `#command`     | Represents an executable action.       | Run, View Logs, Copy        |
| `#remote-repo` | A tool that lives in a git repository. | Install (Clones repo), Pull |
| `#category`    | Used for grouping other nodes.         | Browse, Filter              |

## Relationships: The Graph

Nodes are connected to each other through references. A node's property can be a reference to another node's ID. This allows for rich, multi-directional relationships:

- An `#app` node can have a `commands` property containing a list of references to `#command` nodes.
- A `#command` node can reference the `#app` that owns it.
- Both can reference various `#category` or `#tag` nodes.

## Advantages of this Model

1. **Schema-less Flexibility**: You can add new properties to any node at any time without a database migration.
2. **Universal Querying**: You can query for "all nodes with `#command` tag that also reference `#network` category."
3. **Agent-Friendly**: The explicit structure of nodes and relationships makes it easy for AI agents to navigate the system and understand the context of various tools.

---

Next: Explore the [Command System](command-system.md) to see how nodes come to life.
