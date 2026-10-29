# @dextermos/eliza-plugin-nano-x402

Framework-native **ElizaOS plugin** enabling autonomous AI agents to buy and consume pay-per-call HTTP resources over the **Nano (XNO) x402 protocol** (`nano:mainnet`), secured by strict client-side spend guards, deduplication protection, and zero secrets leakage.

Submitted for **Initiative #13 (Slot 2: ElizaOS)** under the [pursekeeper integrations bounty](https://pursekeeper.dev/integrations).

---

## Features

- **ElizaOS Native**: Exposes `nanoX402Plugin` and `nanoX402Action` (`NANO_X402_FETCH`) conforming to standard ElizaOS agent runtime specifications.
- **Strict Payment Guard**: Enforces all 8 safety invariants before signing any block:
  1. `network === "nano:mainnet"` (foreign chains rejected).
  2. `payTo` destination allowlist check (optional operator pinning).
  3. Per-call amount cap enforcement.
  4. Cumulative session spend cap enforcement.
  5. Deterministic request deduplication (never pays twice for identical request).
  6. Origin redirect protection (never pays cross-origin redirects).
  7. Quote expiration checking (`maxTimeoutSeconds`).
  8. Malformed quote structural validation.
- **Zero Secrets Leakage**: Private keys and seeds are injected via environment variables (`NANO_SEED` or `NANO_PRIVATE_KEY`) or passed as custom signer functions — never printed, logged, or hardcoded.
- **Single-Attempt Semantics**: Signs exactly one send block per call. No automatic retry loops on non-2xx.

---

## Installation

```bash
npm install @dextermos/eliza-plugin-nano-x402
```

---

## Usage in an ElizaOS Agent

```typescript
import { IAgentRuntime } from "@elizaos/core";
import { nanoX402Plugin, PaymentGuardConfig } from "@dextermos/eliza-plugin-nano-x402";

// 1. Configure local spend bounds
const guardConfig: PaymentGuardConfig = {
  maxAmountRawPerCall: 10n ** 27n,      // Cap: 0.001 XNO per call
  cumulativeCapRaw: 10n ** 28n,         // Cap: 0.01 XNO cumulative session cap
  allowedNetwork: "nano:mainnet",
};

// 2. Register plugin with ElizaOS Agent Runtime
export const agentConfig = {
  name: "Autonomous Buyer Agent",
  plugins: [nanoX402Plugin],
  // ... rest of runtime configuration
};

// 3. When the agent receives a prompt to fetch a paid resource,
// the NANO_X402_FETCH action is invoked automatically:
// "Fetch the echo verification from https://pursekeeper.dev/v1/echo?msg=eliza-agent"
```

---

## Offline Security Tests

Run the complete offline test suite (100% mocked, 0 network access):

```bash
npm test
```

All test cases assert strict rejection of malformed quotes, foreign networks, allowlist bypasses, per-call and cumulative cap breaches, duplicate invocations, redirect origin mismatches, and quote timeouts.

---

## License

MIT © Dexter Mos / BountyHunter AI
