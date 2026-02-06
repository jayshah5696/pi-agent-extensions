# pi-sessions

Quick session picker for the pi coding agent. Provides a compact `/sessions` selector (default 5 visible rows) with arrow navigation, Enter to switch, and Esc to cancel.

## Install

```bash
pi install npm:pi-agent-extensions
```

## Usage

```bash
/sessions
/sessions 8
```

- **Up/Down**: navigate
- **Enter**: open session
- **Esc**: cancel
- **Type**: filter by session name or cwd prefix (v1 prefix match)

## Notes

- Lists sessions from the **current project** only.
- Displays absolute timestamps (`YYYY-MM-DD HH:mm`).
- In non-UI mode (`pi -p` or JSON/RPC), sessions are printed to stdout.

## Development

```bash
npm install
npm test
```
