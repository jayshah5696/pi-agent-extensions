# 🎨 Custom Themes for Your Setup

Based on your **Powerlevel10k**, **Ghostty**, **fzf**, and **bat** configuration, I've created **4 custom themes** that match your aesthetic preferences.

## 📊 Your Setup Analysis

### Detected Configuration
- **Shell:** zsh with Powerlevel10k
- **Terminal:** Ghostty (xterm-256color, truecolor support)
- **Tools:** fzf with bat preview, colorized output
- **VSCode Theme:** Default Dark+

### Color Preferences Identified
From your `.p10k.zsh`:
- **Success/OK:** Color 76 (bright green `#5fd700`)
- **Error:** Color 196 (bright red `#ff0087`)
- **Directory:** Color 4 background (blue `#000087`)
- **Foreground:** Colors 254/250/255 (white/gray shades)
- **Borders:** Color 242 (medium gray `#6c6c6c`)
- **Git Clean:** Color 2 (green)
- **Git Modified:** Color 3 (yellow)

---

## 🎯 Your 4 Custom Themes

### 1. **p10k-inspired** (Recommended)
**Direct translation of your Powerlevel10k color scheme**

```bash
pi --theme p10k-inspired
```

**Features:**
- ✅ Uses exact P10K colors (76, 196, 242, 254, etc.)
- ✅ Bright cyan accent (`#00D9FF`) for visual consistency
- ✅ Deep blue-black background (`#0a0e14`)
- ✅ High contrast for readability

**Color Highlights:**
- Success: `#5fd700` (P10K green-76)
- Error: `#ff0087` (P10K red-196)
- Accent: `#00D9FF` (bright cyan)
- Borders: `#6c6c6c` (P10K gray-242)

**Best for:** Maximum consistency with your terminal prompt

---

### 2. **ghostty-dark**
**Optimized for Ghostty terminal aesthetics**

```bash
pi --theme ghostty-dark
```

**Features:**
- ✅ Softer cyan (`#59C2FF`)
- ✅ Warmer color palette
- ✅ Background matches Ghostty dark mode
- ✅ Excellent for long coding sessions

**Color Highlights:**
- Cyan: `#59C2FF` (softer than p10k)
- Green: `#91B362` (warmer green)
- Blue: `#6CB6FF` (sky blue)
- Background: `#0a0e14` (Ghostty-compatible)

**Best for:** Reduced eye strain, warmer aesthetic

---

### 3. **fzf-bat**
**Matches your fzf/bat preview setup with GitHub Dark vibes**

```bash
pi --theme fzf-bat
```

**Features:**
- ✅ GitHub Dark-inspired colors
- ✅ Optimized for syntax highlighting (like bat)
- ✅ Clean borders and backgrounds
- ✅ Professional look

**Color Highlights:**
- Cyan: `#56d4dd` (GitHub cyan)
- Blue: `#79c0ff` (GitHub blue)
- Green: `#7ee787` (GitHub green)
- Background: `#0d1117` (GitHub Dark)

**Best for:** Consistency with GitHub Dark, modern look

---

### 4. **nightowl** (Original from mitsuhiko)
**Night Owl theme (Sarah Drasner) - for reference**

```bash
pi --theme nightowl
```

**Features:**
- Deep blue background (`#011627`)
- Excellent for nighttime coding
- Original from mitsuhiko/agent-stuff

**Best for:** Night coding sessions, high contrast

---

## 🚀 Quick Start

### Use a Theme

```bash
# From command line
pi --theme p10k-inspired

# Or set in ~/.pi/settings.json
{
  "theme": "p10k-inspired"
}

# Or project-specific (.pi/settings.json)
{
  "theme": "./themes/p10k-inspired.json"
}
```

### Compare Themes Side-by-Side

```bash
# Test each theme
pi --theme p10k-inspired
pi --theme ghostty-dark
pi --theme fzf-bat
pi --theme nightowl
```

### Visual Preview

Run this in Pi to see the colors:

```
/context
```

This will show you:
- Border colors
- Accent colors
- Text hierarchy
- Success/error states

---

## 📝 Theme Comparison Table

| Theme | Background | Accent | Success | Error | Best For |
|-------|------------|--------|---------|-------|----------|
| **p10k-inspired** | `#0a0e14` | Bright Cyan | `#5fd700` | `#ff0087` | P10K consistency |
| **ghostty-dark** | `#0a0e14` | Soft Cyan | `#5fd700` | `#ff0087` | Eye comfort |
| **fzf-bat** | `#0d1117` | GitHub Blue | `#7ee787` | `#ff7b72` | GitHub aesthetic |
| **nightowl** | `#011627` | Teal | `#c5e478` | `#EF5350` | Night coding |

---

## 🎨 Customization Guide

### Modify a Theme

```bash
# 1. Copy theme to customize
cp themes/p10k-inspired.json themes/my-theme.json

# 2. Edit colors in the "vars" section
code themes/my-theme.json

# 3. Test your theme
pi --theme ./themes/my-theme.json
```

### Example: Make Accent Brighter

```json
{
  "vars": {
    "accent": "#00FFFF"  // Change from #00D9FF to pure cyan
  }
}
```

### Example: Darker Background

```json
{
  "vars": {
    "background": "#000000"  // Pure black
  }
}
```

---

## 🔍 Color Reference

### Your P10K Colors (256-color palette)

| P10K Color | 256 Code | Hex | Usage |
|------------|----------|-----|-------|
| Green (OK) | 76 | `#5fd700` | Success, prompt OK |
| Red (Error) | 196 | `#ff0087` | Error, prompt fail |
| White | 254 | `#e4e4e4` | Directory text |
| Gray | 250 | `#bcbcbc` | Shortened paths |
| White | 255 | `#eeeeee` | Anchor text |
| Blue | 4 | `#000087` | Directory bg |
| Green | 2 | `#008700` | Git clean |
| Yellow | 3 | `#808000` | Git modified |
| Gray | 242 | `#6c6c6c` | Borders |

### Color Conversion Tool

Your `.p10k.zsh` includes this handy one-liner:
```bash
for i in {0..255}; do print -Pn "%K{$i}  %k%F{$i}${(l:3::0:)i}%f " ${${(M)$((i%6)):#3}:+$'\n'}; done
```

Run this in your terminal to see all 256 colors!

---

## 💡 Recommendations

### Daily Driver
**Use:** `p10k-inspired`  
**Why:** Perfect match with your Powerlevel10k setup, instant visual consistency

### Night Sessions
**Use:** `nightowl`  
**Why:** Deeper blue background, reduced eye strain

### GitHub Projects
**Use:** `fzf-bat`  
**Why:** Matches GitHub Dark, professional appearance

### Long Coding Sessions
**Use:** `ghostty-dark`  
**Why:** Warmer colors, softer on eyes

---

## 🛠️ Advanced Customization

### Match Your Terminal Colors Exactly

If you want to extract your terminal's exact colors:

```bash
# 1. Install colortest
brew install colortest

# 2. Run in Ghostty
colortest-256

# 3. Note colors you like
# 4. Add to theme "vars"
```

### Sync with VSCode

Since you use "Default Dark+", consider these color mappings:

```json
{
  "vars": {
    "background": "#1e1e1e",  // VSCode bg
    "foreground": "#d4d4d4",  // VSCode fg
    "blue": "#569cd6",        // VSCode blue
    "green": "#4ec9b0",       // VSCode green
    "cyan": "#4fc1ff"         // VSCode cyan
  }
}
```

---

## 📦 Theme Locations

```
/Users/jshah/Documents/GitHub/pi-sessions/themes/
├── nightowl.json        # Original (mitsuhiko)
├── p10k-inspired.json   # YOUR COLORS ⭐
├── ghostty-dark.json    # Ghostty optimized
└── fzf-bat.json         # GitHub Dark style
```

---

## 🔄 Switching Themes

### Temporary (One Session)

```bash
pi --theme p10k-inspired
```

### Permanent (Global)

Edit `~/.pi/settings.json`:
```json
{
  "theme": "p10k-inspired"
}
```

### Project-Specific

Edit `.pi/settings.json` in project root:
```json
{
  "theme": "./themes/ghostty-dark.json"
}
```

---

## 🎯 My Recommendation

Start with **`p10k-inspired`** since it:
1. ✅ Matches your existing Powerlevel10k colors exactly
2. ✅ Uses the same success/error colors (76/196)
3. ✅ Maintains visual consistency across terminal and Pi
4. ✅ High contrast for productivity

Try it:
```bash
cd /Users/jshah/Documents/GitHub/pi-sessions
pi --theme p10k-inspired
/context
```

Then experiment with the others to find your favorite!

---

## 🐛 Troubleshooting

### Colors look wrong

```bash
# Check terminal supports truecolor
echo $COLORTERM  # Should show "truecolor"

# Test truecolor
printf "\x1b[38;2;255;100;0mTRUECOLOR\x1b[0m\n"
```

### Theme not loading

```bash
# Verify theme file exists
ls -la themes/p10k-inspired.json

# Check JSON syntax
cat themes/p10k-inspired.json | jq .

# Check package.json
cat package.json | jq '.pi.themes'
```

---

## 📚 Resources

- **Powerlevel10k Docs:** https://github.com/romkatv/powerlevel10k
- **256 Color Chart:** https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit
- **Pi Theme Schema:** https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/theme-schema.json

---

**Created:** February 6, 2026  
**Based on:** Your Powerlevel10k + Ghostty setup  
**Recommended:** p10k-inspired (start here!)
