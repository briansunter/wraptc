# Publishing Guide

This document explains how publishing works for the wraptc monorepo.

## Overview

This monorepo uses **semantic-release** to automate versioning and publishing to npm. When you push to the `master` branch, GitHub Actions will:

1. Run all tests across multiple platforms (Ubuntu, macOS, Windows)
2. Analyze commit messages to determine the next version
3. Generate a changelog
4. Publish packages to npm
5. Create a GitHub release

## Package Structure

The repository publishes three scoped packages:

- `@wraptc/core` - Core routing and state management
- `@wraptc/cli` - Command-line interface (`wtc` command)
- `@wraptc/mcp-server` - MCP server for Claude Desktop integration

## Prerequisites

### 1. Configure GitHub Repository

The repository URLs have been configured for `briansunter`. If you need to change them, update the repository URLs in all `package.json` files:

```bash
# Replace username if needed
find . -name "package.json" -type f ! -path "*/node_modules/*" -exec sed -i '' 's/briansunter/your-username/g' {} \;
```

### 2. Set Up npm Token

1. Create an npm access token:
   - Go to https://www.npmjs.com/settings/tokens
   - Click "Create New Token"
   - Select "Automation" type (required for CI/CD)
   - Copy the token

2. Add the token to GitHub Secrets:
   - Go to your repository settings
   - Navigate to "Secrets and variables" → "Actions"
   - Create a new secret named `NPM_TOKEN`
   - Paste your npm token

### 3. Set Up Codecov (Optional)

If you want coverage reports:

1. Sign up at https://codecov.io
2. Add your repository
3. Get your upload token
4. Add `CODECOV_TOKEN` to GitHub Secrets

## Workflow

### Automatic Publishing (Recommended)

Publishing happens automatically when you push to `master`:

```bash
# Make your changes
git add .
git commit -m "feat: add new feature"

# Push to master triggers the workflow
git push origin master
```

The GitHub Actions workflow will:
- Validate your code (lint, type-check, test)
- Create a new version based on your commits
- Publish to npm
- Create a GitHub release

### Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) to control versioning:

```bash
# Features (minor version bump)
git commit -m "feat: add support for new provider"

# Bug fixes (patch version bump)
git commit -m "fix: resolve routing issue with fallback providers"

# Performance (patch version bump)
git commit -m "perf: optimize state manager writes"

# Documentation (patch version bump)
git commit -m "docs: update installation guide"

# Breaking changes (major version bump)
git commit -m "feat!: change provider interface API"

# Or with a body
git commit -m "feat!: change provider interface API

BREAKING CHANGE: The provider interface now requires async methods
"
```

### Manual Workflow Dispatch

You can also trigger the workflow manually:

1. Go to GitHub Actions → "Publish Packages"
2. Click "Run workflow"
3. Check "Dry run" to test without publishing
4. Click "Run workflow"

## Local Testing

### Dry Run

Test what would be published:

```bash
bun install
bun run release:dry-run
```

This shows what version would be released and what changelog would be generated.

### Build All Packages

```bash
bun run build
```

### Test Before Publishing

```bash
bun test
bun run lint
bun run build
```

## Semantic Release Configuration

The `.releaserc.json` file controls:

- **Branch**: `master` (only commits here trigger releases)
- **Tag format**: `v{version}` (e.g., `v1.2.3`)
- **Plugins**:
  - `@semantic-release/commit-analyzer` - Determines version bump
  - `@semantic-release/release-notes-generator` - Creates changelog
  - `@semantic-release/changelog` - Updates CHANGELOG.md
  - `@semantic-release/npm` - Publishes to npm
  - `@semantic-release/git` - Commits changes back to git
  - `@semantic-release/github` - Creates GitHub releases

## Version Bump Rules

| Commit Type | Bump | Example |
|------------|------|---------|
| `feat` | MINOR | 1.0.0 → 1.1.0 |
| `fix` | PATCH | 1.0.0 → 1.0.1 |
| `perf` | PATCH | 1.0.0 → 1.0.1 |
| `refactor` | PATCH | 1.0.0 → 1.0.1 |
| `docs` | PATCH | 1.0.0 → 1.0.1 |
| `feat!` / `BREAKING CHANGE` | MAJOR | 1.0.0 → 2.0.0 |

## Troubleshooting

### Workflow Fails

Check the Actions tab for detailed logs. Common issues:

1. **Missing NPM_TOKEN**: Ensure the secret is set in repository settings
2. **Test failures**: All tests must pass before publishing
3. **Already published**: If version exists, delete and retry or make new commits

### Manual Version Bump (Emergency Only)

If you need to manually bump a version:

```bash
# Go to package directory
cd packages/core

# Bump version (e.g., 1.0.0 → 1.0.1)
npm version patch

# Commit and push
git add .
git commit -m "chore: manual version bump"
git push origin master
```

Note: This creates a release without semantic-release automation. Use sparingly.

### Rollback a Release

If a bad version is published:

```bash
# Unpublish from npm (within 72 hours)
npm unpublish @wraptc/core@1.2.3

# Or deprecate (after 72 hours)
npm deprecate @wraptc/core@1.2.3 "Critical bug in version 1.2.3, use 1.2.4"
```

## GitHub Actions Workflow Details

The `.github/workflows/publish.yml` has two jobs:

### 1. Validate Job

Runs on all three platforms (Ubuntu, macOS, Windows):
- Checks out code
- Installs dependencies
- Runs linting
- Type checks (build)
- Runs tests
- Uploads coverage to Codecov

### 2. Release Job

Only runs on Ubuntu for `master` branch:
- Runs after validation passes
- Builds all packages
- Configures npm authentication
- Runs semantic-release
- Creates GitHub release
- Commits version changes back to repo

## Best Practices

1. **Always commit on `master`**: Only `master` branch triggers releases
2. **Use conventional commits**: Follow the commit message format
3. **Test locally first**: Run `bun test` before pushing
4. **Monitor the Actions**: Check the workflow after pushing
5. **Keep CHANGELOG.md**: It's auto-generated but don't delete it
6. **Tag issues**: Reference GitHub issues in commits: `fix (#123)`

## Additional Resources

- [semantic-release Documentation](https://github.com/semantic-release/semantic-release)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
