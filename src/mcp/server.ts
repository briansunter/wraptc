#!/usr/bin/env bun

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CodingRequestSchema, WrapTerminalCoder } from "../core/index";
import type { CodingRequest } from "../core/index";

// Tool schemas
const RunCodingTaskSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit", "explain", "test"]).default("generate"),
  language: z.string().optional(),
  files: z.array(z.string()).optional(),
  provider: z.string().optional(),
});

const GetProvidersSchema = z.object({});

const DryRunSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit", "explain", "test"]).default("generate"),
  provider: z.string().optional(),
});

class WrapTerminalCoderMCPServer {
  private server: Server;
  private wtc?: WrapTerminalCoder;

  constructor() {
    this.server = new Server(
      {
        name: "wrap-terminalcoder-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
  }

  private async getWTC(): Promise<WrapTerminalCoder> {
    if (!this.wtc) {
      this.wtc = await WrapTerminalCoder.create();
    }
    return this.wtc;
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "run_coding_task",
            description: "Execute a coding task using the best available provider",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The coding task prompt",
                },
                mode: {
                  type: "string",
                  enum: ["generate", "edit", "explain", "test"],
                  description: "The type of coding task",
                  default: "generate",
                },
                language: {
                  type: "string",
                  description: "Language hint for the request",
                  optional: true,
                },
                files: {
                  type: "array",
                  items: { type: "string" },
                  description: "File paths for context",
                  optional: true,
                },
                provider: {
                  type: "string",
                  description: "Specific provider to use",
                  optional: true,
                },
              },
              required: ["prompt"],
            },
          },
          {
            name: "get_providers",
            description: "List all available providers and their current status",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "dry_run",
            description: "Show which provider would be used for a request without executing it",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The coding task prompt",
                },
                mode: {
                  type: "string",
                  enum: ["generate", "edit", "explain", "test"],
                  description: "The type of coding task",
                  default: "generate",
                },
                provider: {
                  type: "string",
                  description: "Specific provider to use",
                  optional: true,
                },
              },
              required: ["prompt"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "run_coding_task": {
            const validated = RunCodingTaskSchema.parse(args);

            const wtc = await this.getWTC();

            const codingRequest: CodingRequest = {
              prompt: validated.prompt,
              mode: validated.mode,
              language: validated.language,
              fileContext: validated.files,
              provider: validated.provider,
              stream: false,
            };

            // Validate with Zod
            const validation = CodingRequestSchema.safeParse(codingRequest);
            if (!validation.success) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Invalid request: ${validation.error.message}`,
                  },
                ],
                isError: true,
              };
            }

            const response = await wtc.route(codingRequest);

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      provider: response.provider,
                      text: response.text,
                      usage: response.usage,
                      meta: response.meta,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          case "get_providers": {
            const wtc = await this.getWTC();
            const providers = await wtc.getProviderInfo();

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(providers, null, 2),
                },
              ],
            };
          }

          case "dry_run": {
            const validated = DryRunSchema.parse(args);

            const wtc = await this.getWTC();

            const codingRequest: CodingRequest = {
              prompt: validated.prompt,
              mode: validated.mode,
              provider: validated.provider,
              stream: false,
            };

            // We can't directly access router's private methods, so we'll check provider availability
            const providers = await wtc.getProviderInfo();

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      request: codingRequest,
                      availableProviders: providers.filter(
                        (p: { outOfCreditsUntil?: string | number | null }) =>
                          p.outOfCreditsUntil ? new Date(p.outOfCreditsUntil) <= new Date() : true,
                      ),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Unknown tool: ${name}`,
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        const err = error as Error;
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Wrap TerminalCoder MCP server running on stdio");
  }
}

// Exportable function to run MCP server
export async function runMCPServer(): Promise<void> {
  const server = new WrapTerminalCoderMCPServer();
  await server.run();
}

// Run server if executed directly
if (import.meta.main) {
  const server = new WrapTerminalCoderMCPServer();
  server.run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { WrapTerminalCoderMCPServer };
