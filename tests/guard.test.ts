import { describe, it, expect } from "vitest";
import { NanoPaymentGuard, GuardViolationError } from "../src/guard";
import { NanoQuote } from "../src/types";

const VALID_PAY_TO = "nano_1xug1q5t7nxoj3ywwzokiea9jz8fq8qfgzp8pbyfr3co3e5xgj755uofu8ue";
const OTHER_PAY_TO = "nano_3t6kheey6rimgt1br79egeqzgtg51cn3ocooxc91ggua4am3btgc7nnm64hz";

function makeValidQuote(overrides?: Partial<NanoQuote>): NanoQuote {
  return {
    scheme: "exact",
    network: "nano:mainnet",
    amount: "1000000000000000000000000000", // 0.001 XNO (10^27 raw)
    payTo: VALID_PAY_TO,
    maxTimeoutSeconds: 60,
    ...overrides,
  };
}

describe("NanoPaymentGuard Offline Safety Invariants", () => {
  it("should accept valid quote", () => {
    const guard = new NanoPaymentGuard();
    const quote = makeValidQuote();
    const amt = guard.checkQuote({
      requestUrl: "https://pursekeeper.dev/v1/echo?msg=test",
      targetUrl: "https://pursekeeper.dev/v1/echo?msg=test",
      method: "GET",
      requestBodyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      quote,
    });
    expect(amt).toBe(1000000000000000000000000000n);
  });

  it("should refuse wrong network", () => {
    const guard = new NanoPaymentGuard();
    const quote = makeValidQuote({ network: "base:mainnet" });
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote,
      })
    ).toThrowError(/wrong network/);
  });

  it("should refuse payTo not in operator allowlist", () => {
    const guard = new NanoPaymentGuard({ allowedPayTo: [VALID_PAY_TO] });
    const quote = makeValidQuote({ payTo: OTHER_PAY_TO });
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote,
      })
    ).toThrowError(/not in operator allowlist/);
  });

  it("should refuse amount above per-call cap", () => {
    const guard = new NanoPaymentGuard({ maxAmountRawPerCall: 10n ** 26n }); // 0.0001 XNO
    const quote = makeValidQuote({ amount: "1000000000000000000000000000" }); // 0.001 XNO > cap
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote,
      })
    ).toThrowError(/exceeds per-call cap/);
  });

  it("should refuse once cumulative cap is reached", () => {
    const guard = new NanoPaymentGuard({ cumulativeCapRaw: 2n * 10n ** 27n }); // 0.002 XNO
    const quote = makeValidQuote({ amount: "1000000000000000000000000000" }); // 0.001 XNO

    // Call 1: OK
    guard.checkQuote({
      requestUrl: "https://pursekeeper.dev/v1/echo?msg=1",
      targetUrl: "https://pursekeeper.dev/v1/echo?msg=1",
      method: "GET",
      requestBodyHash: "hash1",
      quote,
    });
    guard.recordPayment({
      requestUrl: "https://pursekeeper.dev/v1/echo?msg=1",
      method: "GET",
      requestBodyHash: "hash1",
      amountRaw: 10n ** 27n,
    });

    // Call 2: OK
    guard.checkQuote({
      requestUrl: "https://pursekeeper.dev/v1/echo?msg=2",
      targetUrl: "https://pursekeeper.dev/v1/echo?msg=2",
      method: "GET",
      requestBodyHash: "hash2",
      quote,
    });
    guard.recordPayment({
      requestUrl: "https://pursekeeper.dev/v1/echo?msg=2",
      method: "GET",
      requestBodyHash: "hash2",
      amountRaw: 10n ** 27n,
    });

    // Call 3: Exceeds cap -> must refuse
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo?msg=3",
        targetUrl: "https://pursekeeper.dev/v1/echo?msg=3",
        method: "GET",
        requestBodyHash: "hash3",
        quote,
      })
    ).toThrowError(/cumulative cap reached/);
  });

  it("should refuse duplicate invocation for same request (never signs twice)", () => {
    const guard = new NanoPaymentGuard();
    const quote = makeValidQuote();
    const url = "https://pursekeeper.dev/v1/echo?msg=same";
    const bodyHash = "same_body_hash";

    guard.checkQuote({
      requestUrl: url,
      targetUrl: url,
      method: "GET",
      requestBodyHash: bodyHash,
      quote,
    });
    guard.recordPayment({
      requestUrl: url,
      method: "GET",
      requestBodyHash: bodyHash,
      amountRaw: 10n ** 27n,
    });

    // Second call for exact same request must be refused
    expect(() =>
      guard.checkQuote({
        requestUrl: url,
        targetUrl: url,
        method: "GET",
        requestBodyHash: bodyHash,
        quote,
      })
    ).toThrowError(/duplicate request detected/);
  });

  it("should refuse redirect to another origin (never pays cross-origin)", () => {
    const guard = new NanoPaymentGuard();
    const quote = makeValidQuote();
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://evil-redirect.com/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote,
      })
    ).toThrowError(/redirect origin mismatch/);
  });

  it("should refuse malformed quote", () => {
    const guard = new NanoPaymentGuard();

    // Missing payTo
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote: { scheme: "exact", network: "nano:mainnet", amount: "100" } as any,
      })
    ).toThrowError(/missing 'payTo'/);

    // Invalid address checksum
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote: { scheme: "exact", network: "nano:mainnet", amount: "100", payTo: "nano_invalid" } as any,
      })
    ).toThrowError(/invalid payTo address/);

    // Non-integer amount
    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote: { scheme: "exact", network: "nano:mainnet", amount: "invalid_raw", payTo: VALID_PAY_TO } as any,
      })
    ).toThrowError(/non-integer raw amount/);
  });

  it("should refuse expired quote", () => {
    const guard = new NanoPaymentGuard();
    const quote = makeValidQuote({ maxTimeoutSeconds: 30 });
    const receivedAt = Date.now() / 1000 - 45; // 45 seconds old > 30s timeout

    expect(() =>
      guard.checkQuote({
        requestUrl: "https://pursekeeper.dev/v1/echo",
        targetUrl: "https://pursekeeper.dev/v1/echo",
        method: "GET",
        requestBodyHash: "",
        quote,
        quoteReceivedAt: receivedAt,
      })
    ).toThrowError(/quote expired/);
  });
});
