# Workflow extension

`/workflow` is an opinionated dynamic-workflow control plane for Pi. It turns a decomposable request into an inspectable JavaScript program, routes subagents by semantic role, asks for approval, and runs the work in the background.

Requires Pi 0.80.10 or newer.

## First run

```text
/workflow setup
/workflow run audit this repository from correctness, testing, and maintainability angles
```

Setup offers four profiles:

| Profile | Concurrency | Total agents | Intent |
|---|---:|---:|---|
| Lean | 3 | 8 | Cheap, focused fan-out |
| Balanced | 4 | 15 | Everyday default |
| Deep | 6 | 40 | Larger, higher-effort investigation |
| Custom | 1–16 | 1–1000 | Explicit routes and limits |

Each profile maps four roles to an authenticated model and thinking level:

* `scout` — inexpensive discovery and inventory
* `worker` — implementation and substantial analysis
* `reviewer` — independent criticism, preferably from another model family
* `synthesizer` — final integration and judgment

When routes are customized, the model picker starts from Pi's configured `enabledModels` scope and provides the same type-to-filter interaction as `/model`. This keeps provider catalogs with hundreds of entries out of the normal setup path.

## Storage

* Global control settings: `~/.pi/workflows/control-plane.json`
* Optional project settings: `.pi/workflow.json`
* Project workflows: `.pi/workflows/*.js`
* Personal workflows: `~/.pi/workflows/saved/*.js`
* Run journals and results: `~/.pi/workflows/projects/<project-hash>/runs/*.json`

Project workflow files override personal files with the same filename. Run state stays outside the repository.

Three built-in starting points are always available:

```text
/workflow saved code-review {"scope":"the current branch against main"}
/workflow saved repository-audit
/workflow saved migration-plan {"target":"move persistence from files to SQLite"}
```

A personal or project workflow with the same filename overrides the built-in.

## JavaScript API

Workflow scripts begin with a literal metadata export and may use these globals. Metadata phases may be written as `{ title: "Inspect" }` objects or plain strings; orchestration may be top-level or wrapped in `export default async function run()`.

* `agent(prompt, { label, tier, model?, tools?, disallowedTools? })`
* `parallel(thunks)`
* `pipeline(items, ...stages)`
* `phase(title)`
* `log(message)`
* `retry(thunk, { attempts })`
* `gate(thunk, validator, { attempts })`
* `checkpoint(question)`
* `workflow(name, args)` for a saved nested workflow
* `budget`, `args`, and `cwd`

## Security model

Workflow execution requires Pi to mark the project as trusted. Every generated workflow is shown for approval before execution. The runtime uses Node's `vm` to constrain the script's normal globals and improve determinism, but `vm` is not a security sandbox. Run only generated or saved workflow JavaScript you trust.

Subagents receive Pi's standard coding tools unless the script specifies a narrower `tools` allowlist. Repository writes are therefore possible and are called out in the approval preview.
