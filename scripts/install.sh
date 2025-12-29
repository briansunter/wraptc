#!/bin/bash
set -e

# wraptc installation script
# Usage: curl -fsSL https://get.wraptc.dev | bash
#        or
#        wget -qO- https://get.wraptc.dev | bash

VERSION="${VERSION:-latest}"
REPO="briansunter/wraptc"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Darwin)
            PLATFORM="darwin"
            ;;
        Linux)
            PLATFORM="linux"
            ;;
        *)
            error "Unsupported OS: $OS"
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)
            ARCH="x64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac

    FULL_PLATFORM="${PLATFORM}-${ARCH}"
}

# Get latest version if not specified
get_version() {
    if [ "$VERSION" = "latest" ]; then
        info "Fetching latest version..."
        VERSION=$(curl -fsSL https://api.github.com/repos/${REPO}/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
        if [ -z "$VERSION" ]; then
            error "Failed to fetch latest version"
        fi
        info "Latest version: $VERSION"
    fi
}

# Download and install binary
install_binary() {
    BINARY_NAME="wraptc-${FULL_PLATFORM}"
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY_NAME}"
    TEMP_DIR=$(mktemp -d)
    BINARY_PATH="${TEMP_DIR}/${BINARY_NAME}"

    info "Downloading wraptc ${VERSION} for ${FULL_PLATFORM}..."
    if command -v curl &> /dev/null; then
        curl -fsSL "$DOWNLOAD_URL" -o "$BINARY_PATH"
    elif command -v wget &> /dev/null; then
        wget -qO "$BINARY_PATH" "$DOWNLOAD_URL"
    else
        error "Neither curl nor wget is installed"
    fi

    # Make executable
    chmod +x "$BINARY_PATH"

    # Check if install directory exists or is writable
    if [ ! -d "$INSTALL_DIR" ]; then
        info "Creating install directory: $INSTALL_DIR"
        sudo mkdir -p "$INSTALL_DIR"
    fi

    # Install binary
    if [ -w "$INSTALL_DIR" ]; then
        info "Installing wraptc to $INSTALL_DIR..."
        cp "$BINARY_PATH" "${INSTALL_DIR}/wraptc"
    else
        info "Installing wraptc to $INSTALL_DIR (sudo required)..."
        sudo cp "$BINARY_PATH" "${INSTALL_DIR}/wraptc"
    fi

    # Clean up
    rm -rf "$TEMP_DIR"

    info "Installation complete!"
}

# Verify installation
verify() {
    if command -v wraptc &> /dev/null; then
        info "wraptc $(wraptc --version 2>/dev/null || echo 'installed successfully')"
        info ""
        info "Run 'wraptc --help' to get started"
    else
        warn "Installation completed but 'wraptc' is not in PATH"
        warn "Try: export PATH=\"\$PATH:$INSTALL_DIR\""
    fi
}

# Main installation flow
main() {
    info "Installing wraptc..."
    echo ""

    detect_platform
    get_version
    install_binary
    verify

    echo ""
    info "For Homebrew installation, use:"
    info "  brew install briansunter/wraptc/wraptc"
    echo ""
    info "For npm installation, use:"
    info "  npm install -g wraptc"
}

main "$@"
