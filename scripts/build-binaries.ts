#!/usr/bin/env bun
/**
 * Build native binaries for wraptc CLI
 * Compiles the CLI into standalone executables for multiple platforms
 */

import path from "node:path";
import { $ } from "bun";

const BUILD_DIR = "binaries";
const CLI_ENTRY = "src/cli/index.ts";

// Platform targets for bun build --compile
const platforms = [
  { os: "darwin", arch: "x64", name: "darwin-x64" },
  { os: "darwin", arch: "arm64", name: "darwin-arm64" },
  { os: "linux", arch: "x64", name: "linux-x64" },
  { os: "linux", arch: "arm64", name: "linux-arm64" },
  { os: "windows", arch: "x64", name: "windows-x64", ext: ".exe" },
];

async function build() {
  // Clean build directory
  await $`rm -rf ${BUILD_DIR}`;
  await $`mkdir -p ${BUILD_DIR}`;

  console.log("Building wraptc CLI binaries...\n");

  for (const platform of platforms) {
    const { os, arch, name, ext = "" } = platform;
    const outputFile = path.join(BUILD_DIR, `wraptc-${name}${ext}`);

    console.log(`Building for ${os} ${arch}...`);

    try {
      // bun build --compile creates a standalone binary
      await $`bun build --compile ${CLI_ENTRY} --outfile ${outputFile} --target ${os}-${arch}`;

      // Make it executable (not for Windows)
      if (os !== "windows") {
        await $`chmod +x ${outputFile}`;
      }

      console.log(`✓ Built ${outputFile}`);
    } catch (error) {
      console.error(`✗ Failed to build for ${os} ${arch}:`, error);
      process.exit(1);
    }
  }

  console.log("\n✓ All binaries built successfully!");
  console.log(`Binaries are in: ${BUILD_DIR}/`);
}

// Run build
build();
