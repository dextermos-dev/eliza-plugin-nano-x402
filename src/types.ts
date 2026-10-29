/**
 * Core type definitions for ElizaOS Nano x402 plugin and spend guards.
 */

export interface PaymentGuardConfig {
  maxAmountRawPerCall?: bigint;
  cumulativeCapRaw?: bigint;
  allowedPayTo?: string[];
  allowedNetwork?: string;
  maxTimeoutSeconds?: number;
}

export interface NanoQuote {
  scheme: string;
  network: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, any>;
}

export interface SignedSendBlock {
  type: "state";
  subtype: "send";
  link: string;
  amount: string;
  hash: string;
  signature: string;
  work?: string;
}

export type NanoSigner = (payTo: string, amountRaw: bigint) => Promise<SignedSendBlock> | SignedSendBlock;

// ElizaOS Core Framework Types
export interface Memory {
  id?: string;
  userId?: string;
  agentId?: string;
  content: {
    text: string;
    url?: string;
    method?: string;
    body?: string;
    [key: string]: any;
  };
  roomId?: string;
}

export interface State {
  [key: string]: any;
}

export interface IAgentRuntime {
  getSetting(key: string): string | undefined;
}

export type HandlerCallback = (response: { text: string; [key: string]: any }) => void;

export interface Action {
  name: string;
  similes: string[];
  description: string;
  validate: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => Promise<any>;
}

export interface Plugin {
  name: string;
  description: string;
  actions: Action[];
  providers?: any[];
  evaluators?: any[];
}
