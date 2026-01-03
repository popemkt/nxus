# Installing GitHub CLI

This guide covers how to install the GitHub CLI (`gh`) on your system.

## Smart Installation

We provided a smart PowerShell script that automatically detects your OS and installs the CLI using the appropriate package manager.

**[View Install Script](command:gh-view-install-script)**

To run it, simply use the **Install** command in the app.

## Manual Installation

If you prefer to install manually, follow the instructions for your platform below.

### Linux (Fedora / RHEL / CentOS)

Using `dnf`:

```bash
sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
sudo dnf install gh
```

### Linux (Debian / Ubuntu)

Using `apt`:

```bash
# Get the keyring
wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg

# Add repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null

# Install
sudo apt update
sudo apt install gh
```

### macOS

Using Homebrew:

```bash
brew install gh
```

### Windows

Using Winget:

```powershell
winget install --id GitHub.cli
```

Using Chocolatey:

```powershell
choco install gh
```

For more details, visit the [official installation guide](https://github.com/cli/cli#installation).
