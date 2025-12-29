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
