# Homebrew Publishing Guide

This document explains how Homebrew publishing works for wraptc and how it was set up.

## Overview

wraptc uses the **main repository as a Homebrew tap**, which means the Homebrew formula lives directly in the wraptc repo at `Formula/wraptc.rb`. Users can install wraptc via:

```bash
brew install briansunter/wraptc/wraptc
```

## Architecture

### Traditional vs. Single-Repo Approach

**Traditional Approach (NOT used):**
```
briansunter/homebrew-wraptc  (separate tap repo)
  └── Formula/wraptc.rb      (formula file)

briansunter/wraptc           (main project repo)
  └── source code
```

**Our Approach (Single Repo):**
```
briansunter/wraptc           (main project repo)
  ├── Formula/wraptc.rb      (formula file - doubles as tap!)
  ├── src/                   (source code)
  ├── scripts/               (build scripts)
  └── ...
```

### Why Single Repo?

For a single-tool project like wraptc, using the main repo as a tap has advantages:
- ✅ One less repository to manage
- ✅ Formula updates tracked alongside code changes
- ✅ Simpler release workflow
- ✅ All documentation in one place

## How It Works

### Directory Structure

```
wraptc/
├── Formula/
│   └── wraptc.rb           # Homebrew formula (this IS the tap)
├── .github/workflows/
│   └── release-binaries.yml  # CI/CD that updates the formula
├── src/
│   ├── cli/
│   ├── core/
│   └── mcp/
└── ...
```

### The Formula File

`Formula/wraptc.rb` is a standard Homebrew formula:

```ruby
# typed: strict
# frozen_string_literal: true

class Wraptc < Formula
  desc "Unified CLI wrapper for multiple coding AI agents with intelligent routing"
  homepage "https://github.com/briansunter/wraptc"
  version "0.1.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/briansunter/wraptc/releases/download/v0.1.1/wraptc-darwin-arm64"
      sha256 "04e51dea925afaccd272774ecdd4c604b2cb863f755fc9e26e2c9c3d0df08fc1"
    else
      url "https://github.com/briansunter/wraptc/releases/download/v0.1.1/wraptc-darwin-x64"
      sha256 "8f240a7c5648e3b8bd517003ef6709fe7ab77565cd7e7afc0356253258e3dbdd"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/briansunter/wraptc/releases/download/v0.1.1/wraptc-linux-arm64"
      sha256 "8541543a1b9a27778734a382dc31f226e4b55e64a1d4cc2024ca5953c9c1a4a2"
    else
      url "https://github.com/briansunter/wraptc/releases/download/v0.1.1/wraptc-linux-x64"
      sha256 "c3fb22e8706d65179184d4bfca69599287d8936938462b7fe47ac02e50b813b7"
    end
  end

  def install
    bin.install "wraptc-darwin-#{Hardware::CPU.arch}" => "wraptc" if OS.mac?
    bin.install "wraptc-linux-#{Hardware::CPU.arch}" => "wraptc" if OS.linux?
  end

  test do
    system bin/"wraptc", "--version"
  end
end
```

### Key Formula Components

**1. Platform Detection**
```ruby
on_macos do
  if Hardware::CPU.arm?
    # Apple Silicon
  else
    # Intel
  end
end

on_linux do
  if Hardware::CPU.arm?
    # ARM64
  else
    # x64
  end
end
```

**2. Binary URLs**
- Point to GitHub Releases assets
- Include version tag in URL
- Different binary per platform

**3. SHA256 Checksums**
- Security verification
- Must match downloaded binary exactly
- Calculated with: `shasum -a 256 <binary>`

**4. Installation Method**
```ruby
def install
  bin.install "wraptc-darwin-#{Hardware::CPU.arch}" => "wraptc" if OS.mac?
  bin.install "wraptc-linux-#{Hardware::CPU.arch}" => "wraptc" if OS.linux?
end
```

**5. Test Block**
```ruby
test do
  system bin/"wraptc", "--version"
end
```
Homebrew runs this to verify installation works.

## CI/CD Workflow

### Automated Publishing

The `.github/workflows/release-binaries.yml` workflow handles updates:

```yaml
update-brew-formula:
  name: Update Homebrew Formula
  needs: build-binaries
  runs-on: ubuntu-latest
  if: github.repository == 'briansunter/wraptc'
  steps:
    - name: Checkout wraptc repo
      uses: actions/checkout@v4

    - name: Update Formula
      run: |
        TAG="${{ github.event.inputs.tag || github.event.release.tag_name }}"
        VERSION="${TAG#v}"

        # Download binaries and calculate checksums
        curl -LfsS "https://github.com/briansunter/wraptc/releases/download/${TAG}/wraptc-darwin-arm64" -o wraptc-darwin-arm64
        ARM64_SHA=$(shasum -a 256 wraptc-darwin-arm64 | awk '{print $1}')

        # Update formula with checksums
        sed -i "s/{{ arm64_sha }}/${ARM64_SHA}/" Formula/wraptc.rb

        # Commit changes
        git add Formula/wraptc.rb
        git commit -m "chore: update wraptc to ${VERSION} [skip ci]"
        git push
```

### Workflow Triggers

**Automatic:**
- Triggers when a GitHub Release is created
- Runs after binaries are built and uploaded

**Manual:**
```bash
gh workflow run release-binaries.yml -f tag=v0.1.1
```

## Manual Formula Updates

When automatic updates fail, update manually:

### 1. Download Binaries

```bash
# Download all binaries from release
gh release download v0.1.1 --dir /tmp/wraptc-binaries

# Calculate checksums
cd /tmp/wraptc-binaries
shasum -a 256 * | sort
```

Output:
```
04e51dea925afaccd272774ecdd4c604b2cb863f755fc9e26e2c9c3d0df08fc1  wraptc-darwin-arm64
8f240a7c5648e3b8bd517003ef6709fe7ab77565cd7e7afc0356253258e3dbdd  wraptc-darwin-x64
8541543a1b9a27778734a382dc31f226e4b55e64a1d4cc2024ca5953c9c1a4a2  wraptc-linux-arm64
c3fb22e8706d65179184d4bfca69599287d8936938462b7fe47ac02e50b813b7  wraptc-linux-x64
9f8930732307aa18667b43c2732b30ea086332abac1f070819ef692adbea6435  wraptc-windows-x64.exe
```

### 2. Update Formula File

Edit `Formula/wraptc.rb`:
- Update `version "X.Y.Z"`
- Update all URLs with new version tag
- Update all SHA256 checksums

### 3. Test Locally

```bash
# Untap if already tapped
brew untap briansunter/wraptc

# Tap from main repo
brew tap briansunter/wraptc https://github.com/briansunter/wraptc

# Install formula
brew install briansunter/wraptc/wraptc

# Test
wraptc --version
wraptc providers
```

### 4. Commit and Push

```bash
git add Formula/wraptc.rb
git commit -m "chore: update Homebrew formula to v0.1.1"
git push
```

## User Installation

### For Users

**Installation:**
```bash
brew install briansunter/wraptc/wraptc
```

**Upgrade:**
```bash
brew upgrade briansunter/wraptc/wraptc
```

**Uninstall:**
```bash
brew uninstall briansunter/wraptc/wraptc
```

### What Happens During Installation

1. **Tap Discovery**
   - Homebrew looks up `briansunter/wraptc`
   - Clones: `https://github.com/briansunter/wraptc`
   - Expects: `Formula/wraptc.rb` at repo root

2. **Formula Parsing**
   - Homebrew reads `Formula/wraptc.rb`
   - Detects user's platform (macOS/Linux, ARM/x64)
   - Selects appropriate binary URL

3. **Download**
   - Downloads binary from GitHub Releases
   - Verifies SHA256 checksum
   - Fails if checksum doesn't match

4. **Installation**
   - Installs to `/opt/homebrew/Cellar/wraptc/VERSION/`
   - Symlinks to `/opt/homebrew/bin/wraptc`
   - Runs test block to verify

5. **Completion**
   - Binary available in PATH
   - Ready to use!

## Troubleshooting

### Issue: "No available formula"

**Cause:** Tap not set up correctly or repo structure wrong.

**Solution:**
```bash
# Check tap exists
brew tap-info briansunter/wraptc

# Re-tap from main repo
brew untap briansunter/wraptc
brew tap briansunter/wraptc https://github.com/briansunter/wraptc
```

### Issue: "Checksum mismatch"

**Cause:** Binary file changed or wrong checksum in formula.

**Solution:**
```bash
# Download and verify manually
curl -LfsS https://github.com/briansunter/wraptc/releases/download/v0.1.1/wraptc-darwin-arm64 -o test
shasum -a 256 test

# Update formula with correct checksum
```

### Issue: "Bad CPU type in executable"

**Cause:** Trying to run ARM binary on Intel (or vice versa).

**Solution:**
```bash
# Check binary architecture
file /opt/homebrew/bin/wraptc

# Should match your CPU:
# Apple Silicon: "arm64"
# Intel: "x86_64"
```

### Issue: "Version mismatch"

**Cause:** Old formula cached locally.

**Solution:**
```bash
# Force upgrade
brew upgrade --fetch-HEAD wraptc

# Or reinstall
brew reinstall briansunter/wraptc/wraptc
```

## Private Repositories

If the wraptc repo were private, Homebrew installation would require authentication:

```bash
# Set up GitHub token
export HOMEBREW_GITHUB_API_TOKEN="your_token_here"

# Install (requires authentication)
brew install briansunter/wraptc/wraptc
```

**For public distribution:**
- Keep repo public (recommended for CLI tools)
- Or use GitHub Packages with authentication
- Or provide alternative installation methods (npm, direct download)

## Best Practices

### Formula Updates

1. **Keep in sync with releases**
   - Every GitHub Release should update the formula
   - Use automated CI/CD workflow

2. **Test before pushing**
   - Always test installation locally
   - Verify on multiple platforms if possible

3. **Semantic versioning**
   - Follow version bump rules
   - Use conventional commits

### Release Checklist

For each release:

- [ ] Build native binaries for all platforms
- [ ] Upload to GitHub Releases
- [ ] Calculate SHA256 checksums
- [ ] Update `Formula/wraptc.rb`
- [ ] Test installation on macOS
- [ ] Test installation on Linux (if possible)
- [ ] Verify binary works: `wraptc --version`
- [ ] Commit and push formula update

### Security Considerations

1. **SHA256 Checksums**
   - Always verify checksums
   - Prevents tampering
   - Catches download errors

2. **HTTPS Only**
   - Always use HTTPS URLs
   - Prevents man-in-the-middle attacks

3. **Reproducible Builds**
   - Same source → same binary
   - Enables verification
   - Use `bun build --compile`

## Comparison with Other Methods

| Method | Pros | Cons |
|--------|------|------|
| **Homebrew (Single Repo)** | • Simple<br>• Integrated<br>• Auto-updates | • macOS/Linux only<br>• Requires formula updates |
| **npm** | • Cross-platform<br>• Familiar to devs | • Requires runtime (Bun)<br>• Registry dependency |
| **Direct Download** | • No dependencies<br>• Works everywhere | • Manual updates<br>• No package management |
| **Installation Script** | • User-friendly<br>• Flexible | • Security concerns (curl \| bash)<br>• Maintenance burden |

## Future Improvements

Potential enhancements:

1. **Automatic formula updates via GitHub Actions**
   - Already implemented
   - Needs testing and refinement

2. **Multiple formula versions**
   - Support for installing specific versions
   - `brew install wraptc@0.1.0`

3. **Bottle support**
   - Pre-built binaries for Homebrew
   - Faster installation
   - More native Homebrew experience

4. **Automated testing**
   - Test formula in CI
   - Multi-platform testing
   - Catch issues before release

## Resources

- [Homebrew Formula Cookbook](https://docs.brew.sh/Formula-Cookbook)
- [Homebrew for Python Developers](https://docs.brew.sh/Python-for-Formula-Authors)
- [Creating a Homebrew Tap](https://docs.brew.sh/Taps)
- [Bun Compilation](https://bun.sh/docs/bundler/executables)

## Summary

wraptc's Homebrew publishing uses a **single-repo tap approach**:

- Formula lives at `Formula/wraptc.rb` in main repo
- GitHub Actions builds binaries and updates formula
- Users install with: `brew install briansunter/wraptc/wraptc`
- Automatic updates on releases
- Manual updates when needed

This setup is simple, maintainable, and follows Homebrew best practices for single-tool projects.
