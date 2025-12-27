import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { CodingRequest } from "../../core/index.js";
import { WrapTerminalCoderMCPServer } from "../server.js";

// Mock WrapTerminalCoder
const mockRoute = mock(async (request: CodingRequest) => ({
  provider: "gemini",
  text: "Generated response",
  usage: { inputTokens: 10, outputTokens: 20 },
  meta: { elapsedMs: 1500 },
}));

const mockGetProviderInfo = mock(async () => [
  {
    id: "gemini",
    displayName: "Gemini CLI",
    requestsToday: 5,
    outOfCreditsUntil: null,
    available: true,
  },
  {
    id: "codex",
    displayName: "Codex CLI",
    requestsToday: 2,
    outOfCreditsUntil: new Date(Date.now() + 3600000), // 1 hour from now
    available: true,
  },
]);

const mockWrapTerminalCoder = {
  route: mockRoute,
  getProviderInfo: mockGetProviderInfo,
};

mock.module("../../core/index.js", () => ({
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
const mockSetRequestHandler = mock();
const mockConnect = mock(async () => {});

const mockServer = {
  setRequestHandler: mockSetRequestHandler,
  connect: mockConnect,
};

mock.module("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: mock(() => mockServer),
}));

mock.module("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: mock(() => ({})),
}));

mock.module("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: "call-tool-schema",
  ListToolsRequestSchema: "list-tools-schema",
}));

describe("WrapTerminalCoderMCPServer", () => {
  let server: WrapTerminalCoderMCPServer;

  beforeEach(() => {
    // Reset mocks
    mockSetRequestHandler.mockClear();
    mockConnect.mockClear();
    mockRoute.mockClear();
    mockGetProviderInfo.mockClear();

    server = new WrapTerminalCoderMCPServer();
  });

  describe("constructor", () => {
    test("should create server with request handlers", () => {
      expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("tool handlers", () => {
    describe("ListTools", () => {
      test("should return list of available tools", async () => {
        const listToolsHandler = mockSetRequestHandler.mock.calls.find(
          (call: any[]) => call[0] === "list-tools-schema",
        )?.[1];

        expect(listToolsHandler).toBeDefined();
        const result = await listToolsHandler?.();

        expect(result.tools).toHaveLength(3);
        expect(result.tools.map((t: any) => t.name)).toEqual([
          "run_coding_task",
          "get_providers",
          "dry_run",
        ]);
      });

      test("should include tool schemas with correct properties", async () => {
        const listToolsHandler = mockSetRequestHandler.mock.calls.find(
          (call: any[]) => call[0] === "list-tools-schema",
        )?.[1];

        const result = await listToolsHandler?.();

        const runCodingTask = result.tools.find((t: any) => t.name === "run_coding_task");
        expect(runCodingTask.inputSchema.properties.prompt.type).toBe("string");
        expect(runCodingTask.inputSchema.properties.mode.enum).toEqual([
          "generate",
          "edit",
          "explain",
          "test",
        ]);
        expect(runCodingTask.inputSchema.required).toEqual(["prompt"]);
      });
    });

    describe("CallTool - run_coding_task", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        const handler = mockSetRequestHandler.mock.calls.find(
          (call: any[]) => call[0] === "call-tool-schema",
        )?.[1];
        callToolHandler = handler!;
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

        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual({
          provider: "gemini",
          text: "Generated response",
          usage: { inputTokens: 10, outputTokens: 20 },
          meta: { elapsedMs: 1500 },
        });
      });

      test("should handle errors gracefully", async () => {
        // Mock route to throw
        mockRoute.mockImplementationOnce(async () => {
          throw new Error("Provider failed");
        });

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
        expect(result.content[0].text).toContain("Error:");
      });
    });

    describe("CallTool - get_providers", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        const handler = mockSetRequestHandler.mock.calls.find(
          (call: any[]) => call[0] === "call-tool-schema",
        )?.[1];
        callToolHandler = handler!;
      });

      test("should return provider information", async () => {
        const request = {
          params: {
            name: "get_providers",
            arguments: {},
          },
        };

        const result = await callToolHandler(request);

        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].id).toBe("gemini");
      });
    });

    describe("CallTool - dry_run", () => {
      let callToolHandler: Function;

      beforeEach(() => {
        const handler = mockSetRequestHandler.mock.calls.find(
          (call: any[]) => call[0] === "call-tool-schema",
        )?.[1];
        callToolHandler = handler!;
      });

      test("should return available providers for request", async () => {
        const request = {
          params: {
            name: "dry_run",
            arguments: {
              prompt: "Test prompt",
              mode: "generate",
            },
          },
        };

        const result = await callToolHandler(request);

        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.request.prompt).toBe("Test prompt");
        expect(parsed.request.mode).toBe("generate");
        expect(parsed.availableProviders).toBeDefined();
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
        const handler = mockSetRequestHandler.mock.calls.find(
          (call: any[]) => call[0] === "call-tool-schema",
        )?.[1];
        callToolHandler = handler!;
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

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });
});
