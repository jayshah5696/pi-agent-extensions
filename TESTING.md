# 🧪 Testing Guide - New Extensions & Themes

Step-by-step guide to test everything that was just installed.

---

## 🚀 Quick Test (5 minutes)

### Step 1: Start Pi

```bash
cd /Users/jshah/Documents/GitHub/pi-sessions
pi
```

**Expected output:**
```
Extensions: sessions, ask_user, handoff, notify, context, files, review, loop
```

### Step 2: Test Each Extension

Copy-paste these commands one by one in the Pi session:

#### Test 1: Context Dashboard
```
/context
```

**What you should see:**
- Token usage bar chart
- List of extensions (8 total)
- Skills available
- Session cost/tokens
- Press `q` or `Esc` to close

#### Test 2: Files Browser
```
/files
```

**What you should see:**
- Interactive file list (git status + session files)
- Type to filter files
- Arrow keys to navigate
- Press `Enter` to select, `Esc` to cancel

**Try:**
- Type a filename to search
- Press `Ctrl+Shift+D` on a git-tracked file to diff
- Press `Enter` and choose "Add to prompt"

#### Test 3: Desktop Notifications

This one happens automatically! Run any command:
```
Create a simple hello.py file
```

**What you should see:**
- Pi completes the task
- A desktop notification appears (if your terminal supports OSC 777)
- Title: "π"
- Body: Snippet of the last message

**Check if it worked:**
- Look for a notification popup
- If nothing appears, your terminal may not support OSC 777 (see troubleshooting below)

#### Test 4: Review Command
```
/review
```

**What you should see:**
- Interactive picker with review options:
  - Review uncommitted changes
  - Review against base branch
  - Review specific commit
  - Custom review

**Try:**
- Select "Review uncommitted changes" (if you have any)
- Or select "Cancel" to exit

#### Test 5: Loop Command
```
/loop
```

**What you should see:**
- Interactive picker with loop modes:
  - Until tests pass
  - Until custom condition
  - Self driven (agent decides)

**Try:**
- Select "Self driven" 
- Watch for loop widget: "Loop active: ..."
- Agent will work until it calls `signal_loop_success`
- Or press `Esc` to cancel before starting

---

## 🎨 Test Themes

### Method 1: Command Line (Temporary)

Open a new terminal and test each theme:

```bash
cd /Users/jshah/Documents/GitHub/pi-sessions

# Test your custom P10K theme
pi --theme p10k-inspired

# Once Pi starts, run:
/context
```

**What to check:**
- Borders should be gray (#6c6c6c)
- Accent text should be bright cyan (#00D9FF)
- Success colors should be bright green (#5fd700)
- Background should be dark blue-black

Exit Pi (Ctrl+D), then test the next theme:

```bash
# Test Ghostty-optimized theme
pi --theme ghostty-dark
/context

# Test GitHub Dark theme
pi --theme fzf-bat
/context

# Test original Night Owl
pi --theme nightowl
/context
```

### Method 2: Set Permanently

Edit your Pi settings:

```bash
# Create Pi config directory if it doesn't exist
mkdir -p ~/.pi

# Edit settings
code ~/.pi/settings.json
```

Add this:
```json
{
  "theme": "p10k-inspired"
}
```

Save and restart Pi:
```bash
cd /Users/jshah/Documents/GitHub/pi-sessions
pi
```

### Visual Theme Comparison

Run this to see all theme colors at once:

```bash
# Test p10k-inspired
pi --theme p10k-inspired
```

Then in Pi:
```
List all files in the current directory and show me what the /context command displays. Use colors to show success (green) and any warnings (red).
```

This will show you:
- ✅ Green success colors
- ⚠️ Yellow/red warning colors
- 🔵 Blue/cyan accents
- 📝 Text hierarchy

---

## 🔧 Test Tmux Skill (Claude Code)

The tmux skill is installed in `~/.claude/skills/tmux/` and works with Claude Code, not Pi.

### In Claude Code (not Pi):

Open a new Claude Code session and try:

**Test 1: Start Python REPL**
```
Start a Python REPL in a tmux session and run print("Hello from tmux!")
```

**What Claude should do:**
1. Create tmux session at `/tmp/claude-tmux-sockets/`
2. Start Python REPL
3. Send the print command
4. Show you output
5. Give you a command to monitor the session yourself

**Test 2: Check Sessions**
```
Use the tmux skill to list all active Claude tmux sessions
```

**Test 3: Run Interactive Command**
```
In tmux, start a Python REPL, wait for the prompt, then calculate 2+2
```

### Manual Test (Outside Claude)

You can also test the scripts directly:

```bash
# Test find-sessions script
~/.claude/skills/tmux/scripts/find-sessions.sh --help

# Create a test tmux session
SOCKET_DIR=${TMPDIR:-/tmp}/claude-tmux-sockets
mkdir -p "$SOCKET_DIR"
tmux -S "$SOCKET_DIR/test.sock" new -d -s test-session

# List sessions
~/.claude/skills/tmux/scripts/find-sessions.sh -S "$SOCKET_DIR/test.sock"

# Clean up
tmux -S "$SOCKET_DIR/test.sock" kill-session -t test-session
```

---

## 🧪 Detailed Extension Tests

### notify Extension (Desktop Notifications)

**Test notification support:**

```bash
# Test if your terminal supports OSC 777
echo -e "\033]777;notify;Test;Hello from terminal\007"
```

**Expected:** Desktop notification appears

**If no notification:**
- Check: Are you using Ghostty, iTerm2, WezTerm, or rxvt-unicode?
- Not supported: Kitty, Terminal.app, Alacritty, Windows Terminal

**In Pi:**
```
Create a test.txt file with "Hello World"
```

Wait for Pi to finish. You should see a notification.

---

### context Extension (Context Dashboard)

**Detailed test:**

```bash
pi
```

In Pi:
```
/context
```

**What to check:**
- [ ] Window usage bar appears (shows token distribution)
- [ ] Extensions list shows 8 extensions
- [ ] Skills list appears (may show skills from your ~/.claude/skills/)
- [ ] AGENTS.md file listed (if it exists in your project)
- [ ] Session totals show tokens + cost
- [ ] Press 'q' to close

**Test skill tracking:**
```
Read the README.md file
/context
```

The context view should now highlight README as a "loaded" resource.

---

### files Extension (File Browser)

**Test all features:**

```bash
pi
```

In Pi:
```
/files
```

**Test 1: Navigation**
- [ ] Arrow keys move selection
- [ ] Type to filter (fuzzy search)
- [ ] Files with git status show first

**Test 2: Actions**
- [ ] Select a file
- [ ] Choose "Add to prompt"
- [ ] File path should appear in editor

**Test 3: Shortcuts**
```
# Press Ctrl+Shift+F (reveal latest file)
# Press Ctrl+Shift+O (open files browser)
# Press Ctrl+Shift+R (Quick Look - macOS only)
```

**Test 4: Diff (if you have uncommitted changes)**
```
/files
# Select a modified file
# Press Ctrl+Shift+D or choose "Diff in VS Code"
```

---

### review Extension (Code Review)

**Test review modes:**

```bash
pi
```

**Test 1: Review uncommitted changes**
```
/review uncommitted
```

**What happens:**
- Shows diff of uncommitted changes
- Agent reviews the changes
- Provides feedback

**Test 2: Review against branch**
```
/review branch main
```

**What happens:**
- Shows diff between current branch and main
- Agent reviews changes

**Test 3: Interactive picker**
```
/review
```

**Test shortcuts:**
- Press `Ctrl+R` to trigger review

---

### loop Extension (Iterative Execution)

**Test loop modes:**

```bash
pi
```

**Test 1: Until tests pass**
```
/loop
# Select "Until tests pass"
```

**What happens:**
- Widget appears: "Loop active: breaks when tests pass"
- Agent runs tests
- If tests fail, agent fixes and tries again
- Loop ends when tests pass (agent calls signal_loop_success)

**Test 2: Custom condition**
```
/loop custom "file hello.txt exists"
```

**What happens:**
- Agent works until hello.txt exists
- Shows widget with condition
- Calls signal_loop_success when done

**Test 3: Self-driven**
```
/loop self
```

**What happens:**
- Agent decides when task is complete
- Works autonomously
- Calls signal_loop_success when satisfied

---

## 📊 Verification Checklist

### Extensions Loading
- [ ] All 8 extensions show on Pi startup
- [ ] No error messages during load
- [ ] Commands are available (try `/` + Tab to autocomplete)

### Extensions Working
- [ ] `/context` shows dashboard
- [ ] `/files` shows file browser
- [ ] `/review` shows review options
- [ ] `/loop` shows loop modes
- [ ] Desktop notifications appear (if terminal supports)

### Themes Available
- [ ] Can load `p10k-inspired` theme
- [ ] Can load `ghostty-dark` theme
- [ ] Can load `fzf-bat` theme
- [ ] Can load `nightowl` theme
- [ ] Colors look correct (not broken)

### Tmux Skill
- [ ] Scripts are executable (`ls -la ~/.claude/skills/tmux/scripts/`)
- [ ] Can run in Claude Code
- [ ] Sessions created in `/tmp/claude-tmux-sockets/`

---

## 🐛 Troubleshooting

### Extensions not loading

```bash
# Check package.json
cat /Users/jshah/Documents/GitHub/pi-sessions/package.json | jq '.pi.extensions'

# Expected: Array of 8 extension paths
```

### Themes not working

```bash
# Check themes registered
cat /Users/jshah/Documents/GitHub/pi-sessions/package.json | jq '.pi.themes'

# Validate theme JSON
cat /Users/jshah/Documents/GitHub/pi-sessions/themes/p10k-inspired.json | jq .

# Test theme directly
pi --theme /Users/jshah/Documents/GitHub/pi-sessions/themes/p10k-inspired.json
```

### Notifications not appearing

```bash
# Check terminal
echo $TERM_PROGRAM  # Should show: ghostty

# Test OSC 777 support
echo -e "\033]777;notify;Test;Message\007"

# If no notification, your terminal doesn't support OSC 777
# This is OK - other extensions still work fine
```

### Tmux skill not found

```bash
# Check installation
ls -la ~/.claude/skills/tmux/

# Expected: SKILL.md and scripts/ directory

# Check scripts executable
ls -la ~/.claude/skills/tmux/scripts/

# Expected: -rwxr-xr-x (executable bit set)

# Make executable if needed
chmod +x ~/.claude/skills/tmux/scripts/*.sh
```

---

## 🎯 Expected Results Summary

### ✅ All Working
- Pi starts with 8 extensions
- `/context` shows dashboard
- `/files` shows file browser
- `/review` works for uncommitted changes
- `/loop` starts iterative execution
- Notifications appear (if supported)
- Themes load without errors
- Colors look correct

### 🎨 Theme Preview

**p10k-inspired:**
- Dark blue-black background
- Bright cyan accents
- Bright green success (#5fd700)
- Bright red errors (#ff0087)

**ghostty-dark:**
- Similar to p10k but warmer
- Softer cyan
- Easier on eyes

**fzf-bat:**
- GitHub Dark style
- Professional look
- Modern colors

---

## 📝 Quick Test Script

Run this to test everything at once:

```bash
cd /Users/jshah/Documents/GitHub/pi-sessions

# Start Pi and run tests
pi --theme p10k-inspired << 'EOF'
/context
/files
Create a test file called hello.txt
EOF
```

---

## 💡 Next Steps After Testing

1. **Choose your favorite theme** and set it in `~/.pi/settings.json`
2. **Customize themes** if needed (edit `themes/*.json`)
3. **Explore extensions** by using them in real workflows
4. **Read documentation** in `docs/` for deeper understanding
5. **Add tests** for extensions (optional)

---

**Testing takes ~10 minutes total**  
**Most important:** `/context`, `/files`, and themes  
**Have fun exploring!** 🚀
