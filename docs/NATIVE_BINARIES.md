# Native Binary Distribution

This document explains how wraptc distributes native binaries that can be used without requiring Bun to be installed.

## Overview

wraptc provides standalone native binaries for multiple platforms:
- **macOS** (Intel x64 and Apple Silicon ARM64)
- **Linux** (x64 and ARM64)
- **Windows** (x64)

These binaries are compiled using `bun build --compile` which bundles the entire Bun runtime into the executable.

## Build Process

### Local Building

To build native binaries locally:

```bash
bun run build:binaries
```

This creates binaries in the `binaries/` directory:
- `wraptc-darwin-x64` - macOS Intel
- `wraptc-darwin-arm64` - macOS Apple Silicon
- `wraptc-linux-x64` - Linux x64
- `wraptc-linux-arm64` - Linux ARM64
- `wraptc-windows-x64.exe` - Windows x64

### CI/CD Building

Binaries are automatically built and uploaded to GitHub Releases via `.github/workflows/release-binaries.yml`. This workflow:

1. **Triggers**: When a new GitHub Release is created (by semantic-release)
2. **Builds**: Binaries for all platforms using GitHub Actions runners
3. **Uploads**: Attaches binaries to the GitHub Release
4. **Updates**: Updates the Homebrew formula with new checksums

## Installation Methods

### 1. Installation Script

```bash
curl -fsSL https://get.wraptc.dev | bash
```

The script (`scripts/install.sh`):
- Detects OS and architecture
- Downloads the appropriate binary from GitHub Releases
- Installs to `/usr/local/bin` (or custom directory via `INSTALL_DIR`)
- Makes the binary executable

### 2. Homebrew

```bash
brew install briansunter/wraptc/wraptc
```

The Homebrew formula:
- Lives in the main `wraptc` repository under `Formula/wraptc.rb`
- Automatically updated by the release-binaries workflow
- Detects platform and downloads appropriate binary
- Verifies SHA256 checksums

### 3. Manual Download

Users can download directly from GitHub Releases:
- https://github.com/briansunter/wraptc/releases/latest

## Release Workflow

When a new version is released:

1. **semantic-release** (in `publish.yml` workflow):
   - Analyzes commits
   - Bumps version (e.g., 0.0.2 → 0.0.3)
   - Publishes to npm
   - Creates GitHub Release with notes

2. **release-binaries** workflow triggers on release creation:
   - Builds binaries for all platforms
   - Attaches binaries to the release
   - Updates Homebrew formula with SHA256 checksums

3. **Users** can then:
   - Download binaries from GitHub Releases
   - Install via Homebrew
   - Use the installation script

## File Structure

```
wraptc/
├── scripts/
│   ├── build-binaries.ts    # Build script for local compilation
│   └── install.sh           # Installation script for users
├── homebrew/
│   └── wraptc.rb           # Homebrew formula template
├── .github/
│   └── workflows/
│       └── release-binaries.yml  # CI/CD workflow for building binaries
└── binaries/               # Built binaries (gitignored)
```

## Development

### Testing Locally

To test a built binary:

```bash
# Build the binary
bun run build:binaries

# Test it
./binaries/wraptc-darwin-arm64 --version
./binaries/wraptc-darwin-arm64 providers
./binaries/wraptc-darwin-arm64 ask -p "test" --dry-run
```

### Manual Release (for testing)

To manually trigger binary building without a full release:

1. Go to Actions tab in GitHub
2. Select "Release Binaries" workflow
3. Click "Run workflow"
4. Enter the tag to build for (e.g., `v0.0.2`)

## Platform Support Matrix

| Platform | Architecture | Binary Name | Tested |
|----------|-------------|-------------|--------|
| macOS | x64 (Intel) | `wraptc-darwin-x64` | ✅ |
| macOS | arm64 (Apple Silicon) | `wraptc-darwin-arm64` | ✅ |
| Linux | x64 | `wraptc-linux-x64` | ✅ |
| Linux | arm64 | `wraptc-linux-arm64` | ⚠️ |
| Windows | x64 | `wraptc-windows-x64.exe` | ⚠️ |

✅ = Tested in CI
⚠️ = Builds but may need additional testing

## Troubleshooting

### Binary Not Executing

```bash
# Make sure the binary is executable
chmod +x wraptc-*

# Check if it's the right architecture
file wraptc-darwin-arm64
# Should show: Mach-O 64-bit executable arm64
```

### "Command Not Found" After Installation

Add to PATH (if not using default `/usr/local/bin`):

```bash
export PATH="$PATH:/path/to/install/dir"
```

### Homebrew Installation Issues

```bash
# Update tap
brew update
brew upgrade briansunter/wraptc/wraptc

# Or reinstall
brew reinstall briansunter/wraptc/wraptc
```

## Size Considerations

Native binaries are larger than the npm package because they include the Bun runtime:
- npm package: ~100 KB (code only)
- Native binary: ~80-100 MB (includes Bun runtime)

Trade-off:
- ✅ No runtime dependency
- ✅ Faster startup
- ✅ Single-file distribution
- ❌ Larger download size

## Security

- Binaries are built from signed commits on the master branch
- SHA256 checksums are verified in Homebrew formula
- Installation script can be inspected before running
- Source code is available on GitHub for audit

## Future Improvements

- [ ] Add code signing for macOS (notarization)
- [ ] Add MSI installer for Windows
- [ ] Add DEB/RPM packages for Linux
- [ ] Reduce binary size with tree-shaking
- [ ] Add automatic update mechanism
