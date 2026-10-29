import { describe, it, expect, vi } from "vitest";
import { createNanoX402Action, nanoX402Plugin } from "../src/action";
import { IAgentRuntime, Memory } from "../src/types";

describe("ElizaOS Nano x402 Action & Plugin Integration", () => {
  it("should have correct action properties", () => {
    const action = createNanoX402Action();
    expect(action.name).toBe("NANO_X402_FETCH");
    expect(action.similes).toContain("BUY_NANO_RESOURCE");
    expect(nanoX402Plugin.actions).toHaveLength(1);
    expect(nanoX402Plugin.name).toBe("plugin-nano-x402");
  });

  it("should validate valid http/https URLs", async () => {
    const action = createNanoX402Action();
    const runtime: IAgentRuntime = { getSetting: () => undefined };

    const validMsg: Memory = { content: { text: "fetch", url: "https://pursekeeper.dev/v1/echo?msg=hello" } };
    const invalidMsg: Memory = { content: { text: "fetch", url: "ftp://invalid" } };

    expect(await action.validate(runtime, validMsg)).toBe(true);
    expect(await action.validate(runtime, invalidMsg)).toBe(false);
  });

  it("should handle guarded fetch execution", async () => {
    // Mock client
    const mockClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        headers: { "content-type": "text/plain" },
        body: "echo: hello",
      }),
    };

    const action = createNanoX402Action({ client: mockClient as any });
    const runtime: IAgentRuntime = { getSetting: () => undefined };
    const msg: Memory = { content: { text: "call", url: "https://pursekeeper.dev/v1/echo?msg=hello" } };

    const callback = vi.fn();
    const result = await action.handler(runtime, msg, undefined, undefined, callback);

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBe("echo: hello");
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });
});
