# typed: strict
# frozen_string_literal: true

class Wraptc < Formula
  desc "Unified CLI wrapper for multiple coding AI agents with intelligent routing"
  homepage "https://github.com/briansunter/wraptc"
  version "0.0.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/briansunter/wraptc/releases/download/v0.0.2/wraptc-darwin-arm64"
      sha256 "PLACEHOLDER_ARM64_SHA"
    else
      url "https://github.com/briansunter/wraptc/releases/download/v0.0.2/wraptc-darwin-x64"
      sha256 "PLACEHOLDER_X64_SHA"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/briansunter/wraptc/releases/download/v0.0.2/wraptc-linux-arm64"
      sha256 "PLACEHOLDER_LINUX_ARM64_SHA"
    else
      url "https://github.com/briansunter/wraptc/releases/download/v0.0.2/wraptc-linux-x64"
      sha256 "PLACEHOLDER_LINUX_X64_SHA"
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
