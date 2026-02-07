# Hyper JS Guide

Hyper is a beautiful and extensible terminal emulator built on web technologies. This guide helps you get started and customize your terminal experience.

## Installation

You can install Hyper using your favorite package manager:

- **macOS (Homebrew)**: `brew install --cask hyper`
- **Windows (Winget)**: `winget install --id Zeit.Hyper`
- **Linux (Debian/Ubuntu)**: Download `.deb` from [hyper.is](https://hyper.is/)
- **Linux (Fedora/RHEL)**: Download `.rpm` from [hyper.is](https://hyper.is/)

## Basic Usage

### Launch Hyper

{{command:hyper-open}}

### Configuration

Hyper's configuration is stored in a `.hyper.js` file.

- **macOS**: `~/Library/Application Support/Hyper/.hyper.js`
- **Windows**: `%APPDATA%\Hyper\.hyper.js`
- **Linux**: `~/.config/Hyper/.hyper.js`

## Plugins and Themes

Hyper is highly extensible. You can find plugins and themes at [hyper.is/plugins](https://hyper.is/plugins) and [hyper.is/themes](https://hyper.is/themes).

### Install a Plugin

To install a plugin, use the `hyper i` command followed by the plugin name.

{{command:hyper-install-plugin}}

### List Installed Plugins

{{command:hyper-list-plugins}}

### Advanced Customization

You can customize your shell, fonts, colors, and more in the `.hyper.js` file. For example, to change the shell to `bash` on Linux:

```javascript
module.exports = {
  config: {
    shell: '/bin/bash',
    // ... other settings
  },
  // ... plugins
}
```
