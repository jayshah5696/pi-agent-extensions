# Deployment & Installation Guide

This document describes how to deploy `pi-agent-extensions` and its configuration across different environments.

## NPM Package

**Published**: `pi-agent-extensions@0.1.0`
- **Registry**: https://www.npmjs.com/package/pi-agent-extensions
- **Install**: `pi install npm:pi-agent-extensions`

The package is publicly available on NPM and will be discovered by pi's package manager automatically.

## Configuration Management

All pi configuration is managed in the **dotfiles repository**:
- **Repository**: https://github.com/jayshah5696/dotfiles
- **Location**: `.config/pi/`

This includes:
- `settings.json` - Main pi configuration (models, packages, thinking level)
- `pi-sub-core-settings.json` - Provider configuration
- `extensions/exa-mcp.json` - MCP extension configuration
- `scripts/pi-install.sh` - Automated setup script

## Installation on New Machine

### Prerequisites
- Node.js 18+ (for npm)
- macOS or Linux
- Internet connection (for NPM downloads)

### Quick Setup

```bash
# 1. Clone dotfiles
cd ~/Documents/GitHub
git clone https://github.com/jayshah5696/dotfiles.git
cd dotfiles

# 2. Install pi configuration
./scripts/pi-install.sh

# 3. Verify installation
pi
/settings  # Check if all packages loaded
```

### What Gets Installed

The `scripts/pi-install.sh` script:
1. Creates `~/.pi/agent/` directory structure
2. Copies `settings.json` and provider configs
3. Automatically installs 6 packages from NPM:
   - `@benvargas/pi-exa-mcp` (web search)
   - `pi-web-access` (fetch content)
   - `pi-powerline-footer` (status bar)
   - `@marckrenn/pi-sub-core` (core providers)
   - `@tmustier/pi-usage-extension` (token tracking)
   - `pi-agent-extensions` (your extensions)

### Manual Installation (if needed)

```bash
# Copy configuration
mkdir -p ~/.pi/agent/extensions
cp -r ~/Documents/GitHub/dotfiles/.config/pi/* ~/.pi/agent/

# Install packages manually
pi install npm:pi-agent-extensions
pi install npm:@benvargas/pi-exa-mcp
pi install npm:pi-web-access
pi install npm:pi-powerline-footer
pi install npm:@marckrenn/pi-sub-core
pi install npm:@tmustier/pi-usage-extension
```

## Homeserver Deployment

### Docker (Recommended)

```dockerfile
FROM node:25-alpine

RUN npm install -g @mariozechner/pi-coding-agent

# Clone dotfiles
RUN git clone https://github.com/jayshah5696/dotfiles.git /dotfiles

# Setup pi
WORKDIR /dotfiles
RUN chmod +x scripts/pi-install.sh && ./scripts/pi-install.sh

# RPC mode (optional)
ENV PI_MODE=rpc
EXPOSE 3000

CMD ["pi", "--mode", "rpc", "--no-session"]
```

### Linux (Direct Install)

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nodejs npm

# Clone and setup
cd ~/Documents/GitHub
git clone https://github.com/jayshah5696/dotfiles.git
cd dotfiles
./scripts/pi-install.sh

# Start pi
pi
```

## Customization

### Adding New Packages

Edit `~/.config/pi/settings.json` (or `.config/pi/settings.json` in dotfiles):

```json
{
  "packages": [
    "npm:existing-package",
    "npm:new-package"  // Add here
  ]
}
```

Then run `pi install npm:new-package` and commit changes to dotfiles.

### Changing Default Model

Edit `settings.json`:

```json
{
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultProvider": "anthropic"
}
```

### Adjusting Thinking Level

Edit `settings.json`:

```json
{
  "defaultThinkingLevel": "medium"  // off, minimal, low, medium, high, xhigh
}
```

## Configuration NOT in Dotfiles

These are excluded from dotfiles for security/privacy reasons:

- **auth.json** - Contains API credentials (stored separately)
- **sessions/** - Session history and conversation data
- **cache/** - Runtime cache (regenerated automatically)
- **bin/** - Internal binaries (auto-generated)

## Updating Configuration

After making changes locally:

```bash
# Copy to dotfiles
cp ~/.pi/agent/settings.json ~/Documents/GitHub/dotfiles/.config/pi/

# Commit and push
cd ~/Documents/GitHub/dotfiles
git add .config/pi/
git commit -m "chore: update pi configuration"
git push origin main
```

## Troubleshooting

### Extensions not loading
```bash
# Check settings
pi /settings

# Verify installation
pi install npm:pi-agent-extensions

# View available extensions
pi /available-commands
```

### Package installation fails
```bash
# Clear npm cache
npm cache clean --force

# Retry installation
pi install npm:package-name
```

### Configuration not applied
```bash
# Ensure ~/.pi/agent/settings.json exists
ls -la ~/.pi/agent/settings.json

# Restart pi
# (Close and reopen terminal or start new session)
```

## Reference

- Pi Documentation: https://github.com/badlogic/pi-mono
- This Package: https://github.com/jayshah5696/pi-agent-extensions
- Dotfiles: https://github.com/jayshah5696/dotfiles
