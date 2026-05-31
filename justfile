# pi-agent-extensions task runner
# Install just: https://github.com/casey/just

_default:
    @just --list

# Run the full test suite
test:
    npm test

# Inspect the package contents without publishing
pack-dry-run:
    npm pack --dry-run

# Run release checks: tests, version check, and package dry-run
release-check:
    ./scripts/check-release.sh

# Publish a release. Usage: just release patch|minor|major|0.4.5
release version="patch":
    ./scripts/publish-release.sh {{version}}

# Publish a patch release
release-patch:
    ./scripts/publish-release.sh patch

# Publish a minor release
release-minor:
    ./scripts/publish-release.sh minor

# Publish a major release
release-major:
    ./scripts/publish-release.sh major

# Show the local and published npm versions
versions:
    @printf "local:     "
    @node -p "require('./package.json').version"
    @printf "published: "
    @npm view pi-agent-extensions version
