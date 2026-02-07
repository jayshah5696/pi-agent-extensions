# Credits and Acknowledgments

## Third-Party Extensions

This project includes extensions adapted from the following open-source projects:

### mitsuhiko/agent-stuff

**Author:** Armin Ronacher ([@mitsuhiko](https://github.com/mitsuhiko))  
**Repository:** https://github.com/mitsuhiko/agent-stuff  
**License:** Apache 2.0 / MIT

The following extensions were adapted from this repository with gratitude:

| Extension | Original File | Purpose |
|-----------|---------------|---------|
| **notify** | `pi-extensions/notify.ts` | Desktop notifications via OSC 777 escape sequences |
| **context** | `pi-extensions/context.ts` | Context breakdown dashboard showing token usage and loaded resources |
| **files** | `pi-extensions/files.ts` | Unified file browser with git status integration |
| **review** | `pi-extensions/review.ts` | Code review system for uncommitted changes, PRs, and commits |
| **loop** | `pi-extensions/loop.ts` | Iterative execution loop for automated workflows |

**Key contributions from this codebase:**
- Production-ready TUI components
- Git workflow integration patterns
- Session state management via custom entries
- Model selection strategies for utility tasks
- OSC 777 notification implementation

### Modifications

The adapted extensions maintain the original architecture and core functionality, with the following modifications:
- Integration with our existing extension structure
- Consistent file naming (all extensions use `index.ts`)
- Added to our package.json pi.extensions array
- Documented in our docs/ folder

### License Compliance

The original `agent-stuff` repository is dual-licensed under Apache 2.0 and MIT licenses. We have chosen to use these extensions under the MIT license, which is compatible with our project's MIT license.

A copy of the original LICENSE can be found at: https://github.com/mitsuhiko/agent-stuff/blob/main/LICENSE

## Original Extensions

The following extensions were developed specifically for this project:

| Extension | Author | Purpose |
|-----------|--------|---------|
| **sessions** | Jayesh Shah | Quick session picker with filtering |
| **ask-user** | Jayesh Shah | Structured LLM-to-user question tool |
| **handoff** | Jayesh Shah | Goal-driven context transfer |

## Additional Credits

- **Pi Coding Agent:** Created by Mario Zechner ([@badlogicgames](https://github.com/badlogicgames))
- **TypeBox:** JSON Schema validation library by [@sinclairzx81](https://github.com/sinclairzx81)
- **Community:** Thanks to all contributors and users of pi-agent-extensions

## Contributing

If you'd like to contribute to this project, please see [CONTRIBUTING.md](CONTRIBUTING.md) (if available) or open an issue/PR on GitHub.

---

*Last updated: February 6, 2026*
