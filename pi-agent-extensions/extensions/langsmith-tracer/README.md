# langsmith-tracer

A Pi Coding Agent extension that traces every Pi session and tool call to
[LangSmith](https://smith.langchain.com/), giving you full observability over
your agent's behaviour.

## Features

- **Session root run** — each Pi session becomes a root `chain` run in LangSmith
- **Tool-call child runs** — every tool invocation is a child `tool` run linked to the session
- **Parallel / fork support** — concurrent tool calls appear as siblings under the same parent
- **No-op mode** — missing `LANGSMITH_API_KEY` triggers a one-time warning; Pi continues normally
- **Failure resilient** — LangSmith network errors are caught and logged; they never crash Pi

## Setup

```bash
export LANGSMITH_API_KEY="ls__..."        # required
export LANGSMITH_PROJECT="my-project"    # optional (default: "pi-agent")
```

## How it works

```
Pi session
└── pi_session (chain)           ← root run
    ├── read_file (tool)         ← tool call 1
    ├── write_file (tool)        ← tool call 2  (parallel sibling)
    └── search_web (tool)        ← tool call 3
```

## Testing

```bash
npm test
# or
npx vitest run extensions/langsmith-tracer/tests/
```

## Configuration

| Env var               | Default                          | Description                     |
|-----------------------|----------------------------------|---------------------------------|
| `LANGSMITH_API_KEY`   | _(none — no-op mode)_            | LangSmith API key               |
| `LANGSMITH_PROJECT`   | `pi-agent`                       | Project name in LangSmith UI    |
| `LANGCHAIN_ENDPOINT`  | `https://api.smith.langchain.com`| API base URL (for self-hosted)  |
