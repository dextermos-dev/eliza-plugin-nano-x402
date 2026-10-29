/**
 * ElizaOS Action implementation for autonomous Nano x402 resource retrieval.
 */

import { Action, HandlerCallback, IAgentRuntime, Memory, Plugin, State } from "./types";
import { NanoX402Client } from "./client";
import { PaymentGuardConfig } from "./types";

export const createNanoX402Action = (options?: {
  client?: NanoX402Client;
  guardConfig?: PaymentGuardConfig;
}): Action => {
  const client = options?.client ?? new NanoX402Client({ guardConfig: options?.guardConfig });

  return {
    name: "NANO_X402_FETCH",
    similes: [
      "BUY_NANO_RESOURCE",
      "FETCH_PAID_RESOURCE",
      "X402_NANO_GET",
      "X402_NANO_POST",
    ],
    description:
      "Fetches a paid HTTP resource from a Nano x402 doorway (0.001 XNO). " +
      "Automatically negotiates HTTP 402 challenges under strict local spend guards and returns the resource content.",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
      const url = message.content?.url;
      return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
      options?: any,
      callback?: HandlerCallback
    ) => {
      const url = message.content?.url;
      if (!url || typeof url !== "string") {
        throw new Error("valid 'url' string is required in message content");
      }
      const method = (message.content?.method || "GET").toUpperCase();
      const body = message.content?.body;

      try {
        const res = await client.request(url, {
          method,
          body,
        });

        const successText =
          res.status >= 200 && res.status < 300
            ? `Successfully retrieved x402 resource from ${url} (HTTP ${res.status}):\n${res.body}`
            : `Resource request failed (HTTP ${res.status}):\n${res.body}`;

        if (callback) {
          callback({ text: successText, status: res.status, body: res.body });
        }
        return { success: res.status < 400, status: res.status, body: res.body };
      } catch (err: any) {
        const errorText = `x402 fetch failed for ${url}: ${err.message}`;
        if (callback) {
          callback({ text: errorText, error: err.message });
        }
        return { success: false, error: err.message };
      }
    },
  };
};

export const nanoX402Action = createNanoX402Action();

export const createNanoX402Plugin = (options?: {
  client?: NanoX402Client;
  guardConfig?: PaymentGuardConfig;
}): Plugin => {
  return {
    name: "plugin-nano-x402",
    description:
      "Autonomous ElizaOS plugin for pay-per-call HTTP resources over the Nano x402 protocol with strict spend guards",
    actions: [createNanoX402Action(options)],
    providers: [],
    evaluators: [],
  };
};

export const nanoX402Plugin = createNanoX402Plugin();
