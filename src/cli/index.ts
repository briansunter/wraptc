#!/usr/bin/env bun

import { WrapTerminalCoder } from "../core/index.js";
import { CodingRequestSchema } from "../core/index.js";
import type { CodingRequest } from "../core/index.js";
import { Command } from "commander";
import { runMCPServer } from "../mcp/server.js";

const program = new Command();

program
  .name("wraptc")
  .description("wraptc - unified CLI for multiple coding agents")
  .version("0.1.0")
  .option("--mcp", "Start MCP server mode");

// Handle MCP mode flag
program.hook('preAction', async (thisCommand) => {
  const options = thisCommand.opts();
  if (options.mcp) {
    await runMCPServer();
    process.exit(0);
  }
});

program
  .command("ask")
  .alias("a")
  .description("Send a coding request to the best available provider")
  .argument("[prompt]", "The coding prompt (can also use -p or pipe from stdin)")
  .option("-p, --prompt <prompt>", "The prompt to send to the coding agent")
  .option("--use <provider>", "Specific provider to use (qwen, gemini, codex)")
  .option("--mode <mode>", "Task type: generate, edit, explain, test", "generate")
  .option("--lang <language>", "Language hint (js, ts, py, etc.)")
  .option("-f, --file <files...>", "Include file(s) for context")
  .option("-t, --temperature <temp>", "Creativity level (0-2)", Number.parseFloat)
  .option("-s, --stream", "Stream responses in real-time")
  .option("-o, --output <format>", "Output format: text, json", "text")
  .option("-d, --dry-run", "Show which provider will be used")
  .option("-c, --config <path>", "Custom config file path")
  .option("--timeout <seconds>", "Request timeout in seconds", Number.parseInt)
  .option("--retry <count>", "Retry failed requests", Number.parseInt)
  .action(async (promptArg, options) => {
    try {
      // Handle positional argument or option
      let prompt = promptArg || options.prompt;

      // Validate prompt
      if (!prompt && process.stdin.isTTY) {
        console.error("Error: Prompt is required (use positional arg, -p, or pipe from stdin)");
        console.error("Examples:");
        console.error("  wraptc 'Write a function'");
        console.error("  wraptc -p 'Write a function'");
        console.error("  echo 'Write a function' | wraptc");
        process.exit(1);
      }

      // Read from stdin if prompt not provided
      if (!prompt && !process.stdin.isTTY) {
        prompt = await Bun.stdin.text();
      }

      // Build request
      const request: CodingRequest = {
        prompt: prompt.trim(),
        mode: options.mode,
        language: options.lang,
        fileContext: options.file,
        temperature: options.temperature,
        stream: options.stream,
        provider: options.use, // Changed from options.provider
      };

      // Validate request
      const parsed = CodingRequestSchema.safeParse(request);
      if (!parsed.success) {
        console.error("Error: Invalid request:", parsed.error.errors);
        process.exit(1);
      }

      // Create WrapTerminalCoder instance
      const wtc = await WrapTerminalCoder.create({
        configPath: options.config,
      });

      // Dry run mode
      if (options.dryRun) {
        console.log("Would use provider:", request.provider || "auto-selected");
        process.exit(0);
      }

      // Execute request
      if (request.stream) {
        for await (const event of wtc.routeStream(request)) {
          if (options.output === "json") {
            console.log(JSON.stringify(event));
          } else {
            console.log(event.text);
          }
        }
      } else {
        const response = await wtc.route(request);

        if (options.output === "json") {
          console.log(JSON.stringify(response));
        } else {
          console.log(response.text);
        }
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command("providers")
  .description("List available providers and their status")
  .option("-c, --config <path>", "Custom config file path")
  .action(async (options) => {
    try {
      const wtc = await WrapTerminalCoder.create({
        configPath: options.config,
      });

      const providers = await wtc.getProviderInfo();

      console.log("Available Providers:");
      for (const provider of providers) {
        const status = provider.outOfCreditsUntil
          ? `⚠️  Out of credits until ${new Date(provider.outOfCreditsUntil).toLocaleString()}`
          : `✅ ${provider.requestsToday} requests today`;

        console.log(`  ${provider.displayName} (${provider.id}): ${status}`);
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command("mcp")
  .description("Start MCP server")
  .action(async () => {
    await runMCPServer();
  });

program.parse();
