import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";
import { WrapTerminalCoderMCPServer } from "./server";
import { WrapTerminalCoder } from "@wrap-terminalcoder/core";
import type { CodingRequest } from "@wrap-terminalcoder/core";

// Mock dependencies
const mockWrapTerminalCoder = {
  route: mock(async (request: CodingRequest) => ({
    provider: "gemini",
    text: "Generated response",
    usage: { inputTokens: 10, outputTokens: 20 },
    meta: { elapsedMs: 1500 },
  })),
  getProviderInfo: mock(async () => [
    {
      id: "gemini",
      displayName: "Gemini CLI",
      requestsToday: 5,
      outOfCreditsUntil: null,
    },
    {
      id: "codex",
      displayName: "Codex CLI",
      requestsToday: 2,
      outOfCreditsUntil: new Date(Date.now() + 3600000), // 1 hour from now
    },
  ]),
};

mock.module("@wrap-terminalcoder/core", () => ({
  WrapTerminalCoder: {
    create: mock(async () => mockWrapTerminalCoder),
  },
  CodingRequestSchema: {
    safeParse: mock((data: any) => ({
      success: true,
      data,
    })),
  },
}));

// Mock MCP SDK
const mockServer = {
  setRequestHandler: mock(),
  connect: mock(async () => {}),
};

const mockStdioServerTransport = mock();

mock.module("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: mock(() => mockServer),
}));

mock.module("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: mockStdioServerTransport,
}));

mock.module("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: "call-tool-schema",
  ListToolsRequestSchema: "list-tools-schema",
}));

describe("WrapTerminalCoderMCPServer", () => {
  let server: WrapTerminalCoderMCPServer;

  beforeEach(() => {
    // Clear all mocks
    mockServer.setRequestHandler.mockClear();
    mockServer.connect.mockClear();
    mockWrapTerminalCoder.route.mockClear();
    mockWrapTerminalCoder.getProviderInfo.mockClear();

    server = new WrapTerminalCoderMCPServer();
  });

  describe("constructor", () => {
    test("should create server with correct configuration", () => {
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
      // Should set up handlers for ListTools and CallTool requests
    });
  });

  describe("getWTC", () => {
    test("should create WrapTerminalCoder instance on first call", async () => {
      const wtc = await (server as any).getWTC();

      expect(wtc).toBe(mockWrapTerminalCoder);
      expect(WrapTerminalCoder.create).toHaveBeenCalledTimes(1);
    });

    test("should return cached instance on subsequent calls", async () => {
      const wtc1 = await (server as any).getWTC();
      const wtc2 = await (server as any).getWTC();

      expect(wtc1).toBe(wtc2);
      expect(WrapTerminalCoder.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("tool handlers", () => {
    describe("ListTools", () => {
      test("should return list of available tools", async () => {
        const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
          call => call[0] === "list-tools-schema"
        )[1];

        const result = await listToolsHandler();

        expect(result.tools).toHaveLength(3);
        expect(result.tools.map((t: any) => t.name)).toEqual([
          "run_coding_task",
          "get_providers",
          "dry_run",
        ]);
      });

      test("should include tool schemas with correct properties", async () => {
        const listToolsHandler = mockServer.setRequestHandler.mock.calls.find(
          call => call[0] === "list-tools-schema"
        )[1];

        const result = await listToolsHandler();

        const runCodingTask = result.tools.find((t: any) => t.name === "run_coding_task");
        expect(runCodingTask.inputSchema.properties.prompt.type).toBe("string");
        expect(runCodingTask.inputSchema.properties.mode.enum).toEqual(["generate", "edit", "explain", "test"]);
        expect(runCodingTask.inputSchema.required).toEqual(["prompt"]);
      });
    });

    describe("CallTool - run_coding_task", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        callToolHandler = mockServer.setRequestHandler.mock.calls.find(
          call => call[0] === "call-tool-schema"
        )[1];
      });

      test("should execute coding task successfully", async () => {
        const request = {
          params: {
            name: "run_coding_task",
            arguments: {
              prompt: "Write a function to calculate fibonacci",
              mode: "generate",
              language: "typescript",
              files: ["utils.ts"],
              provider: "gemini",
            },
          },
        };

        const result = await callToolHandler(request);

        expect(mockWrapTerminalCoder.route).toHaveBeenCalledWith({
          prompt: "Write a function to calculate fibonacci",
          mode: "generate",
          language: "typescript",
          fileContext: ["utils.ts"],
          provider: "gemini",
          stream: false,
        });

        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual({
          provider: "gemini",
          text: "Generated response",
          usage: { inputTokens: 10, outputTokens: 20 },
          meta: { elapsedMs: 1500 },
        });
      });

      test("should handle validation errors", async () => {
        // Mock validation failure
        const mockCodingRequestSchema = require("@wrap-terminalcoder/core").CodingRequestSchema;
        mockCodingRequestSchema.safeParse.mockReturnValueOnce({
          success: false,
          error: { message: "Invalid mode" },
        });

        const request = {
          params: {
            name: "run_coding_task",
            arguments: {
              prompt: "Test prompt",
              mode: "invalid_mode",
            },
          },
        };

        const result = await callToolHandler(request);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Invalid request: Invalid mode");
      });

      test("should handle execution errors", async () => {
        mockWrapTerminalCoder.route.mockRejectedValueOnce(new Error("Provider failed"));

        const request = {
          params: {
            name: "run_coding_task",
            arguments: {
              prompt: "Test prompt",
            },
          },
        };

        const result = await callToolHandler(request);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error: Provider failed");
      });
    });

    describe("CallTool - get_providers", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        callToolHandler = mockServer.setRequestHandler.mock.calls.find(
          call => call[0] === "call-tool-schema"
        )[1];
      });

      test("should return provider information", async () => {
        const request = {
          params: {
            name: "get_providers",
            arguments: {},
          },
        };

        const result = await callToolHandler(request);

        expect(mockWrapTerminalCoder.getProviderInfo).toHaveBeenCalledTimes(1);
        expect(result.content[0].type).toBe("text");

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toEqual({
          id: "gemini",
          displayName: "Gemini CLI",
          requestsToday: 5,
          outOfCreditsUntil: null,
        });
      });
    });

    describe("CallTool - dry_run", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        callToolHandler = mockServer.setRequestHandler.mock.calls.find(
          call => call[0] === "call-tool-schema"
        )[1];
      });

      test("should return available providers for request", async () => {
        const request = {
          params: {
            name: "dry_run",
            arguments: {
              prompt: "Test prompt",
              mode: "generate",
              provider: "gemini",
            },
          },
        };

        const result = await callToolHandler(request);

        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.request).toEqual({
          prompt: "Test prompt",
          mode: "generate",
          provider: "gemini",
          stream: false,
        });

        expect(parsed.availableProviders).toHaveLength(1);
        expect(parsed.availableProviders[0].id).toBe("gemini");
      });

      test("should filter out providers that are out of credits", async () => {
        const request = {
          params: {
            name: "dry_run",
            arguments: {
              prompt: "Test prompt",
            },
          },
        };

        const result = await callToolHandler(request);

        const parsed = JSON.parse(result.content[0].text);
        // Should only include gemini since codex is out of credits
        expect(parsed.availableProviders).toHaveLength(1);
        expect(parsed.availableProviders[0].id).toBe("gemini");
      });
    });

    describe("CallTool - unknown tool", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        callToolHandler = mockServer.setRequestHandler.mock.calls.find(
          call => call[0] === "call-tool-schema"
        )[1];
      });

      test("should return error for unknown tool", async () => {
        const request = {
          params: {
            name: "unknown_tool",
            arguments: {},
          },
        };

        const result = await callToolHandler(request);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Unknown tool: unknown_tool");
      });
    });
  });

  describe("run", () => {
    test("should connect server to transport", async () => {
      spyOn(console, "error").mockImplementation(() => {});

      await server.run();

      expect(mockServer.connect).toHaveBeenCalledWith(mockStdioServerTransport());
      expect(console.error).toHaveBeenCalledWith("Wrap TerminalCoder MCP server running on stdio");
    });

    test("should handle connection errors", async () => {
      mockServer.connect.mockRejectedValueOnce(new Error("Connection failed"));

      spyOn(console, "error").mockImplementation(() => {});
      spyOn(process, "exit").mockImplementation(() => {});

      await expect(server.run()).rejects.toThrow("Connection failed");
    });
  });

  describe("main execution", () => {
    test("should run server when executed directly", async () => {
      // Mock import.meta.main
      const originalMain = import.meta.main;
      (import.meta as any).main = true;

      spyOn(console, "error").mockImplementation(() => {});

      // Re-import and run
      const serverModule = await import("./server");
      const testServer = new serverModule.WrapTerminalCoderMCPServer();

      spyOn(testServer, "run").mockResolvedValue();

      // Simulate the main execution block
      if (import.meta.main) {
        const server = new serverModule.WrapTerminalCoderMCPServer();
        await server.run().catch(() => {});
      }

      // Restore
      (import.meta as any).main = originalMain;
    });
  });
});
