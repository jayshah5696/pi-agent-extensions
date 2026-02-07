# 📦 Installation & Publishing Guide

Complete guide for installing locally and publishing to npm.

---

## 🚀 Local Installation (Testing)

### Step 1: Install Dependencies

```bash
cd /Users/jshah/Documents/GitHub/pi-sessions
npm install
```

### Step 2: Install Package Locally with Pi

```bash
# Install from current directory
pi install -l .
```

**What this does:**
- Registers all 14 extensions
- Registers all 4 themes
- Makes them available globally on your machine

### Step 3: Verify Installation

```bash
pi list
```

**Expected output:**
```
Project packages:
  ..
    /Users/jshah/Documents/GitHub/pi-sessions
```

### Step 4: Test Extensions

```bash
pi
```

**At startup, you should see:**
```
Extensions: sessions, ask_user, handoff, notify, context, files, review, 
            loop, answer, control, cwd-history, session-breakdown, todos, whimsical
```

---

## 🧪 Testing Locally

### Test Each Extension

```bash
pi
```

Then try these commands:

```
/sessions
/context
/files
/review
/loop
/answer
/cwd
/breakdown
/todos
```

### Test Themes

```bash
pi --theme p10k-inspired
pi --theme ghostty-dark
pi --theme fzf-bat
pi --theme nightowl
```

---

## 📝 Pre-Publishing Checklist

### 1. Update Version

Edit `package.json`:
```json
{
  "version": "0.1.0"  // Change to 0.2.0 or 1.0.0
}
```

### 2. Update README

Make sure `README.md` includes:
- [ ] Clear description
- [ ] Installation instructions
- [ ] List of all extensions
- [ ] List of all themes
- [ ] Usage examples
- [ ] Attribution to mitsuhiko

### 3. Add LICENSE File

```bash
# Copy MIT license
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2026 Jayesh Shah

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

This package includes extensions adapted from mitsuhiko/agent-stuff
(https://github.com/mitsuhiko/agent-stuff) under MIT/Apache 2.0 license.
EOF
```

### 4. Add .npmignore

```bash
cat > .npmignore << 'EOF'
# Development files
tests/
evals/
*.test.ts
.github/
.git/
.gitignore

# Documentation (optional - keep if you want to publish docs)
# docs/dev/
TASK_LOG.md
log.md
IMPLEMENTATION_COMPLETE.md

# Build artifacts
node_modules/
*.log
.DS_Store

# IDE
.vscode/
.idea/
*.swp
*.swo
EOF
```

### 5. Verify Package Contents

```bash
# See what will be published
npm pack --dry-run
```

**Should include:**
- ✅ extensions/
- ✅ themes/
- ✅ docs/
- ✅ package.json
- ✅ README.md
- ✅ LICENSE
- ✅ CREDITS.md
- ❌ node_modules/
- ❌ tests/
- ❌ .git/

---

## 📤 Publishing to npm

### Option 1: Manual Publishing

#### Step 1: Login to npm

```bash
npm login
```

**You'll need:**
- npm username
- npm password
- npm email
- 2FA code (if enabled)

#### Step 2: Publish

```bash
npm publish
```

**For scoped packages:**
```bash
# If package name is @jayshah5696/pi-agent-extensions
npm publish --access public
```

#### Step 3: Verify

```bash
# Check on npm
npm view pi-agent-extensions

# Install from npm
pi install npm:pi-agent-extensions
```

---

### Option 2: Automated Publishing (GitHub Actions)

#### Step 1: Create npm Token

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click "Generate New Token"
3. Choose "Automation" token
4. Copy the token

#### Step 2: Add Token to GitHub Secrets

1. Go to your repo: https://github.com/jayshah5696/pi-agent-extensions
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `NPM_TOKEN`
5. Value: (paste your token)

#### Step 3: Create GitHub Action

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm install
      
      - run: npm test
      
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### Step 4: Trigger Publish

```bash
# Update version in package.json first
git add package.json
git commit -m "Bump version to 1.0.0"
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

GitHub Action will automatically publish to npm!

---

## 🔄 Update Process

### Publishing an Update

1. **Make changes**
2. **Test locally:**
   ```bash
   pi install -l .
   pi  # test your changes
   ```
3. **Update version:**
   ```bash
   npm version patch  # 0.1.0 → 0.1.1
   npm version minor  # 0.1.0 → 0.2.0
   npm version major  # 0.1.0 → 1.0.0
   ```
4. **Publish:**
   ```bash
   npm publish
   ```

---

## 👥 For Users

### Installing Your Package

Once published, users can install with:

```bash
# Install globally
pi install npm:pi-agent-extensions

# Or install to specific project
cd ~/my-project
pi install -l npm:pi-agent-extensions
```

### Using Extensions

```bash
pi

# Extensions auto-load:
Extensions: sessions, ask_user, handoff, notify, context, files, review, 
            loop, answer, control, cwd-history, session-breakdown, todos, whimsical
```

### Using Themes

```bash
pi --theme p10k-inspired
```

Or in `~/.pi/settings.json`:
```json
{
  "theme": "pi-agent-extensions/p10k-inspired"
}
```

---

## 📋 Package.json Requirements

Your `package.json` is already correct! It has:

✅ **name:** `pi-agent-extensions`  
✅ **version:** `0.1.0`  
✅ **keywords:** `["pi-package", "pi", "coding-agent", "extensions"]`  
✅ **files:** `["extensions", "themes", "docs"]`  
✅ **pi.extensions:** Array of 14 extensions  
✅ **pi.themes:** Array of 4 themes  
✅ **repository, homepage, bugs** URLs  
✅ **license:** MIT  

---

## 🔍 Troubleshooting

### Package not installing

```bash
# Check npm login
npm whoami

# Check package.json is valid
npm pack --dry-run

# Check what files will be included
npm publish --dry-run
```

### Extensions not loading

```bash
# Check package was installed
pi list

# Reinstall
pi uninstall pi-agent-extensions
pi install npm:pi-agent-extensions

# Check for errors
pi --debug
```

### Themes not working

```bash
# Check theme files exist in package
npm view pi-agent-extensions files

# Try full path
pi --theme pi-agent-extensions/p10k-inspired
```

---

## 📊 Publishing Checklist

Before running `npm publish`:

- [ ] All 14 extensions working locally
- [ ] All 4 themes loading correctly
- [ ] Tests passing (`npm test`)
- [ ] Version updated in package.json
- [ ] README.md complete
- [ ] LICENSE file exists
- [ ] CREDITS.md includes attribution
- [ ] .npmignore configured
- [ ] Logged into npm (`npm whoami`)
- [ ] Package name available (search on npmjs.com)

---

## 🎯 Quick Commands Reference

```bash
# Local development
npm install
pi install -l .
pi list

# Testing
npm test
pi

# Publishing
npm login
npm version patch
npm publish

# User installation
pi install npm:pi-agent-extensions
pi --theme p10k-inspired
```

---

## 📚 Resources

- **npm Publishing Guide:** https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry
- **Pi Package Guide:** https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- **Semantic Versioning:** https://semver.org/

---

**Current Status:** ✅ Installed locally, ready to test  
**Next Step:** Test all extensions, then publish when ready
