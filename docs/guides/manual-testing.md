# Manual Test Guide for ask_user

## Prerequisites

Install the extension locally:
```bash
cd /path/to/pi-agent-extensions
pi install .
```

Or use with `-e` flag:
```bash
pi -e /path/to/pi-agent-extensions/extensions/ask-user/index.ts
```

## Test 1: Simple Text Question (Interactive)

```bash
pi
```

Then in pi, type:
```
Can you ask me what my favorite color is?
```

Expected: LLM calls `ask_user` tool, you see a text input prompt.

## Test 2: Question with Options (Interactive)

```bash
pi
```

```
Ask me which database I prefer: PostgreSQL, SQLite, or MongoDB
```

Expected: LLM calls `ask_user` with options, you see a selection list.

## Test 3: Multiple Questions (Interactive)

```bash
pi
```

```
Ask me 3 questions: my name, favorite color, and preferred framework
```

Expected: Sequential question prompts (will show one at a time).

## Test 4: Print Mode

```bash
pi -p "Ask me what database I prefer"
```

Expected:
- Creates `.pi/pending-questions.json`
- Prints instructions for how to answer
- No interactive prompt shown

Check file:
```bash
cat .pi/pending-questions.json
```

## Test 5: Verify Tool Registration

```bash
pi
```

Then type:
```
/
```

Expected: See `ask_user` in the available tools list (if pi shows tools).

Or check the startup message for loaded extensions.

## Verification Checklist

- [ ] Extension loads without errors
- [ ] Text questions work
- [ ] Option selection works
- [ ] "Other" option appears and works
- [ ] Print mode creates pending file
- [ ] Tool results show in session history
- [ ] Custom rendering displays correctly

## Known Limitations (v1)

- Multi-select not fully implemented (shows as single select)
- No tabbed UI for multiple questions (shows sequentially)
- No custom TUI components (uses built-in ctx.ui helpers)
