# GitHub Actions Publishing Setup with BWS - Complete

The npm publishing workflow with Bun and **Bitwarden Secrets Manager** is now fully configured! This provides secure, on-demand npm token retrieval without storing tokens in GitHub Secrets.

## Why Bitwarden Secrets Manager (BWS)?

**Security Benefits:**
- ✅ No npm tokens stored in GitHub Secrets
- ✅ On-demand secret retrieval (not persistent)
- ✅ Audit logs for all secret access
- ✅ Centralized secret management
- ✅ Single location for token rotation

**Technical Benefits:**
- ✅ Works with Bun (unlike npm OIDC)
- ✅ No 2FA requirement with Automation tokens
- ✅ Works across multiple repositories
- ✅ Fine-grained access control

## Files Created

### 1. GitHub Actions Workflow
**`.github/workflows/publish.yml`** - Complete CI/CD pipeline with BWS integration:
- Multi-platform testing (Ubuntu, macOS, Windows)
- Automated validation (lint, type-check, tests)
- **Bitwarden Secrets Manager integration** (`bitwarden/sm-action@v2`)
- Semantic release integration
- Automatic npm publishing
- GitHub release creation
- Dry-run support for testing

### 2. Release Configuration
**`.releaserc.json`** - Semantic-release configuration

### 3. npm Configuration
**`.npmrc`** - npm registry settings with dynamic token injection

### 4. Documentation
- **`docs/PUBLISHING.md`** - Comprehensive publishing guide with BWS setup
- **`docs/PUBLISHING_CHECKLIST.md`** - Step-by-step BWS setup checklist
- **`docs/SETUP_SUMMARY.md`** - This quick reference
- **`CHANGELOG.md`** - Auto-generated changelog (initial template)

### 5. Package Updates
All `package.json` files updated with publishing metadata

## Setup Steps

### 1. Create Bitwarden Secrets Manager Project

```bash
bws project create "npm-publishing-wraptc"
# Returns: <BWS_PROJECT_ID>
# Save this!
```

### 2. Create npm Automation Token

1. Go to https://www.npmjs.com/settings/tokens
2. Click "Create New Token"
3. Select **"Automation"** type (critical - bypasses 2FA!)
4. Name it "CI/CD - wraptc"
5. Copy the token

### 3. Store npm Token in BWS

```bash
BWS_ACCESS_TOKEN='<your-bws-access-token>' \
bws secret create NPM_TOKEN "<npm-automation-token>" <BWS_PROJECT_ID>
# Returns: <BWS_SECRET_ID>
# Save this for GitHub Secrets!
```

### 4. Create BWS Machine Account

1. Go to Bitwarden Secrets Manager web vault
2. Navigate to **Machine Accounts**
3. Create new machine account for GitHub Actions
4. Grant access to the project
5. Generate access token: `<BWS_ACCESS_TOKEN>`

### 5. Add Secrets to GitHub

Go to: https://github.com/briansunter/wraptc/settings/secrets/actions

Add two secrets:
1. **`BWS_ACCESS_TOKEN`** - Machine account access token from step 4
2. **`BWS_NPM_TOKEN_ID`** - Secret ID from step 3

### 6. Test Setup

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build packages
bun run build

# Dry-run release (requires BWS_TOKEN env var)
export BWS_ACCESS_TOKEN='<your-bws-access-token>'
bun run release:dry-run
```

### 7. Trigger First Release

```bash
# Ensure on master branch
git checkout master

# Create initial release commit
git commit --allow-empty -m "chore: initial release v1.0.0"

# Push to trigger workflow
git push origin master

# Monitor at: https://github.com/briansunter/wraptc/actions
```

## How It Works

### Traditional Approach (❌ Less Secure)
```
GitHub Secrets → NPM_TOKEN → npm publish
   ↑
   Stored permanently in GitHub
```

### BWS Approach (✅ More Secure)
```
GitHub Actions → BWS API → NPM_TOKEN (fetched on-demand) → npm publish
                     ↑
                     Retrieved from Bitwarden Secrets Manager
                     Audit logged, not stored in GitHub
```

### Workflow Flow

1. **Developer commits** → `git commit -m "feat: add new feature"`
2. **Push to master** → `git push origin master`
3. **GitHub Actions triggers** → `.github/workflows/publish.yml`
4. **Validate job runs**:
   - Checkout code
   - Install dependencies (Bun)
   - Run linting
   - Type check (build)
   - Run tests
5. **Release job runs**:
   - **Fetch npm token from BWS** (using `bitwarden/sm-action@v2`)
   - Build all packages
   - Analyze commits
   - Determine version
   - Generate changelog
   - Publish to npm (with token from BWS)
   - Create GitHub release
   - Commit version changes

## BWS Commands Reference

### List Secrets in Project
```bash
bws secret list <BWS_PROJECT_ID>
```

### Get Specific Secret
```bash
bws secret get <BWS_SECRET_ID>
```

### Update Secret (Rotate Token)
```bash
bws secret edit <BWS_SECRET_ID> --value "<NEW_NPM_TOKEN>"
```

### Delete Secret
```bash
bws secret delete <BWS_SECRET_ID>
```

### Test Local with BWS Token
```bash
# Fetch token from BWS
export NPM_TOKEN=$(bws secret get <BWS_SECRET_ID> -o json | jq -r '.value')

# Test npm auth
NPM_TOKEN='<token>' npm whoami
```

## Secrets Management

| Component | Where Stored | Access Method |
|-----------|--------------|---------------|
| BWS Access Token | GitHub Secrets (`BWS_ACCESS_TOKEN`) | GitHub Actions |
| NPM Token | Bitwarden Secrets Manager | Fetched via BWS API |
| BWS Secret ID | GitHub Secrets (`BWS_NPM_TOKEN_ID`) | GitHub Actions |
| Codecov Token | GitHub Secrets (`CODECOV_TOKEN`) | GitHub Actions |

## Features

✅ **Secure token management** with Bitwarden Secrets Manager
✅ **Multi-platform testing** (Ubuntu, macOS, Windows)
✅ **Automated semantic versioning** based on commit messages
✅ **Automatic changelog generation**
✅ **GitHub release creation** with each version
✅ **Bun-powered** builds for fast CI/CD
✅ **Dry-run mode** for testing without publishing
✅ **Optional Codecov integration**
✅ **Audit logging** for all secret access

## Commit Format for Versioning

```bash
feat:     # New feature → MINOR version (1.0.0 → 1.1.0)
fix:      # Bug fix → PATCH version (1.0.0 → 1.0.1)
feat!:    # Breaking change → MAJOR version (1.0.0 → 2.0.0)
perf:     # Performance improvement → PATCH
docs:     # Documentation → PATCH
refactor: # Code refactoring → PATCH
```

## Packages Published

Three packages published together with synchronized versions:

1. **`@wraptc/core`** - Core library
2. **`@wraptc/cli`** - CLI tool
3. **`@wraptc/mcp-server`** - MCP server

## URLs

- **Repository**: https://github.com/briansunter/wraptc
- **Actions**: https://github.com/briansunter/wraptc/actions
- **Settings/Secrets**: https://github.com/briansunter/wraptc/settings/secrets/actions
- **Bitwarden SM**: https://bitwarden.com/help/secrets-manager-overview/

## Troubleshooting

### BWS Secret Not Found
```bash
# Verify secret ID is correct
bws secret list <BWS_PROJECT_ID>
```

### Access Denied
**Solution**: Verify Machine Account has access to the project in BWS web vault

### npm 2FA Required
**Solution**: Use an **Automation** token type, not Granular or Classic

### Workflow Fails
```bash
# Check BWS access locally
export BWS_ACCESS_TOKEN='<token>'
bws secret get <BWS_SECRET_ID>

# Verify GitHub secrets
gh secret list
```

### Token Rotation (When Needed)
```bash
# 1. Create new npm token at https://www.npmjs.com/settings/tokens

# 2. Update in BWS
bws secret edit <BWS_SECRET_ID> --value "<NEW_NPM_TOKEN>"

# 3. No changes needed in GitHub! BWS fetches latest value automatically
```

## Resources

- [Bitwarden Secrets Manager Docs](https://bitwarden.com/help/secrets-manager-overview/)
- [BWS CLI Documentation](https://bitwarden.com/help/secrets-manager-cli/)
- [bitwarden/sm-action](https://github.com/marketplace/actions/bitwarden-secrets-manager-github-action)
- [npm Automation Tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens)
- [Semantic Release Docs](https://semantic-release.gitbook.io/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

**Status**: ✅ Ready for BWS-based publishing setup!

**Key Advantage**: npm tokens are never stored in GitHub - they're fetched on-demand from Bitwarden Secrets Manager with full audit logging.
