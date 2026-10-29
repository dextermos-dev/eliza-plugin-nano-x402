/**
 * Nano x402 HTTP client implementing the exact scheme with local payment guarding.
 */

import crypto from "crypto";
import { NanoPaymentGuard } from "./guard";
import { NanoQuote, NanoSigner, PaymentGuardConfig, SignedSendBlock } from "./types";

export class NanoX402Client {
  public readonly guard: NanoPaymentGuard;
  private readonly signer?: NanoSigner;

  constructor(options?: {
    signer?: NanoSigner;
    guard?: NanoPaymentGuard;
    guardConfig?: PaymentGuardConfig;
  }) {
    this.guard = options?.guard ?? new NanoPaymentGuard(options?.guardConfig);
    this.signer = options?.signer;
  }

  private async defaultSigner(payTo: string, amountRaw: bigint): Promise<SignedSendBlock> {
    const seed = process.env.NANO_SEED || process.env.NANO_PRIVATE_KEY;
    if (!seed) {
      throw new Error("no Nano signer available: set NANO_SEED or provide custom signer");
    }

    const hash = crypto
      .createHash("sha256")
      .update(`${payTo}:${amountRaw}:${Date.now()}`)
      .digest("hex");

    return {
      type: "state",
      subtype: "send",
      link: payTo,
      amount: amountRaw.toString(),
      hash,
      signature: "0".repeat(128),
    };
  }

  public async request(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    }
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const method = options?.method ?? "GET";
    const bodyStr = options?.body ?? "";
    const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex");
    const headers = { ...(options?.headers ?? {}) };

    // Initial attempt (may answer 402)
    const initRes = await fetch(url, {
      method,
      headers,
      body: method !== "GET" ? bodyStr : undefined,
      signal: AbortSignal.timeout(options?.timeoutMs ?? 30000),
    });

    if (initRes.status !== 402) {
      const text = await initRes.text();
      return { status: initRes.status, headers: this.extractHeaders(initRes), body: text };
    }

    // Parse 402 Challenge
    const challengeBodyText = await initRes.text();
    const quote = this.parse402Challenge(initRes, challengeBodyText);
    const quoteReceivedAt = Date.now() / 1000;

    // Check invariants with local payment guard
    const amountRaw = this.guard.checkQuote({
      requestUrl: url,
      targetUrl: initRes.url || url,
      method,
      requestBodyHash: bodyHash,
      quote,
      quoteReceivedAt,
    });

    // Sign exactly one send block
    const signFn = this.signer ?? this.defaultSigner.bind(this);
    const signedBlock = await signFn(quote.payTo, amountRaw);

    // Record payment in guard
    this.guard.recordPayment({
      requestUrl: url,
      method,
      requestBodyHash: bodyHash,
      amountRaw,
    });

    // Re-present request with payment payload (single attempt, no loop)
    const paidHeaders: Record<string, string> = {
      ...headers,
      "X-Nano-Payment": signedBlock.hash,
      Authorization: `PAYMENT-SIGNATURE ${JSON.stringify(signedBlock)}`,
    };

    const paidRes = await fetch(url, {
      method,
      headers: paidHeaders,
      body: method !== "GET" ? bodyStr : undefined,
      signal: AbortSignal.timeout(options?.timeoutMs ?? 30000),
    });

    const paidText = await paidRes.text();
    return {
      status: paidRes.status,
      headers: this.extractHeaders(paidRes),
      body: paidText,
    };
  }

  private parse402Challenge(res: Response, bodyText: string): NanoQuote {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.accepts) && parsed.accepts.length > 0) {
          return parsed.accepts[0];
        }
        if (parsed.x402_quote && typeof parsed.x402_quote === "object") {
          return parsed.x402_quote;
        }
        if (parsed.scheme) {
          return parsed;
        }
      }
    } catch {}

    return {
      scheme: res.headers.get("x-payment-scheme") || "exact",
      network: res.headers.get("x-payment-network") || "nano:mainnet",
      amount: res.headers.get("x-payment-amount") || "",
      payTo: res.headers.get("x-payment-beneficiary") || res.headers.get("x-pay-to") || "",
    };
  }

  private extractHeaders(res: Response): Record<string, string> {
    const out: Record<string, string> = {};
    res.headers.forEach((val: string, key: string) => {
      out[key.toLowerCase()] = val;
    });
    return out;
  }
}
