/**
 * Security guard for autonomous Nano x402 payments in ElizaOS.
 */

import { PaymentGuardConfig, NanoQuote } from "./types";
import { normalizeNanoAddress } from "./address";

export class GuardViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardViolationError";
  }
}

export class NanoPaymentGuard {
  public cumulativeSpentRaw: bigint = 0n;
  public readonly maxAmountRawPerCall: bigint;
  public readonly cumulativeCapRaw: bigint;
  public readonly allowedNetwork: string;
  public readonly maxTimeoutSeconds: number;
  private readonly allowedPayTo: Set<string>;
  private readonly signedRequestKeys: Set<string> = new Set();

  constructor(config?: PaymentGuardConfig) {
    this.maxAmountRawPerCall = config?.maxAmountRawPerCall ?? 10n ** 28n; // 0.01 XNO
    this.cumulativeCapRaw = config?.cumulativeCapRaw ?? 10n ** 29n;       // 0.1 XNO
    this.allowedNetwork = config?.allowedNetwork ?? "nano:mainnet";
    this.maxTimeoutSeconds = config?.maxTimeoutSeconds ?? 60;
    this.allowedPayTo = new Set(
      (config?.allowedPayTo ?? []).map((addr) => normalizeNanoAddress(addr))
    );
  }

  public checkQuote(params: {
    requestUrl: string;
    targetUrl: string;
    method: string;
    requestBodyHash: string;
    quote: NanoQuote | any;
    quoteReceivedAt?: number;
  }): bigint {
    const { requestUrl, targetUrl, method, requestBodyHash, quote } = params;

    if (!quote || typeof quote !== "object") {
      throw new GuardViolationError(`malformed quote: expected object, got ${typeof quote}`);
    }

    // 1. Scheme check
    if (quote.scheme !== "exact") {
      throw new GuardViolationError(`unsupported scheme: ${quote.scheme}; only 'exact' supported`);
    }

    // 2. Network check
    if (quote.network !== this.allowedNetwork) {
      throw new GuardViolationError(
        `wrong network: ${quote.network}; required ${this.allowedNetwork}`
      );
    }

    // 3. Destination allowlist check
    if (!quote.payTo) {
      throw new GuardViolationError("malformed quote: missing 'payTo' field");
    }

    let payTo: string;
    try {
      payTo = normalizeNanoAddress(quote.payTo);
    } catch (e: any) {
      throw new GuardViolationError(`malformed quote: invalid payTo address: ${e.message}`);
    }

    if (this.allowedPayTo.size > 0 && !this.allowedPayTo.has(payTo)) {
      throw new GuardViolationError(`payTo ${payTo} is not in operator allowlist`);
    }

    // 4. Amount parsing & per-call cap
    if (quote.amount === undefined || quote.amount === null || quote.amount === "") {
      throw new GuardViolationError("malformed quote: missing 'amount'");
    }

    let amountRaw: bigint;
    try {
      amountRaw = BigInt(String(quote.amount).trim());
    } catch {
      throw new GuardViolationError(`malformed quote: non-integer raw amount ${quote.amount}`);
    }

    if (amountRaw <= 0n) {
      throw new GuardViolationError(`amount must be positive: ${amountRaw}`);
    }

    if (amountRaw > this.maxAmountRawPerCall) {
      throw new GuardViolationError(
        `amount ${amountRaw} raw exceeds per-call cap ${this.maxAmountRawPerCall} raw`
      );
    }

    // 5. Cumulative spend cap
    if (this.cumulativeSpentRaw + amountRaw > this.cumulativeCapRaw) {
      throw new GuardViolationError(
        `cumulative cap reached: current spent ${this.cumulativeSpentRaw} + new ${amountRaw} raw > cap ${this.cumulativeCapRaw} raw`
      );
    }

    // 6. Origin redirect guard (never pay a cross-origin redirect)
    try {
      const reqUrlObj = new URL(requestUrl);
      const targetUrlObj = new URL(targetUrl);
      if (reqUrlObj.origin !== targetUrlObj.origin) {
        throw new GuardViolationError(
          `redirect origin mismatch: requested ${requestUrl} redirected to ${targetUrl}`
        );
      }
    } catch (e: any) {
      if (e instanceof GuardViolationError) throw e;
      throw new GuardViolationError(`invalid URL format: ${e.message}`);
    }

    // 7. Quote timeout check
    const now = Date.now() / 1000;
    const receivedAt = params.quoteReceivedAt ?? now;
    const maxTimeout = quote.maxTimeoutSeconds ?? this.maxTimeoutSeconds;
    if (now - receivedAt > maxTimeout) {
      throw new GuardViolationError(
        `quote expired: age ${(now - receivedAt).toFixed(1)}s > maxTimeoutSeconds ${maxTimeout}s`
      );
    }

    // 8. Duplicate request guard (never sign a second block for identical request)
    const reqKey = `${method.toUpperCase()}:${requestUrl}:${requestBodyHash}`;
    if (this.signedRequestKeys.has(reqKey)) {
      throw new GuardViolationError(
        `duplicate request detected: payment for ${reqKey} was already signed`
      );
    }

    return amountRaw;
  }

  public recordPayment(params: {
    requestUrl: string;
    method: string;
    requestBodyHash: string;
    amountRaw: bigint;
  }): void {
    const reqKey = `${params.method.toUpperCase()}:${params.requestUrl}:${params.requestBodyHash}`;
    this.signedRequestKeys.add(reqKey);
    this.cumulativeSpentRaw += params.amountRaw;
  }
}
