/**
 * Nano address validation and checksum normalization.
 */

import { blake2b } from "blakejs";

const ALPHABET = "13456789abcdefghijkmnopqrstuwxyz";
const ADDRESS_RE = /^(?:nano|xrb)_([13][13456789abcdefghijkmnopqrstuwxyz]{59})$/;

export function normalizeNanoAddress(address: string): string {
  const trimmed = address.trim();
  const match = ADDRESS_RE.exec(trimmed);
  if (!match || !checksumOk(match[1])) {
    throw new Error(`not a valid Nano address: ${address}`);
  }
  return "nano_" + match[1];
}

export function isNanoAddress(address: string): boolean {
  try {
    normalizeNanoAddress(address);
    return true;
  } catch {
    return false;
  }
}

function checksumOk(body: string): boolean {
  let bits = 0n;
  for (let i = 0; i < 52; i++) {
    const idx = ALPHABET.indexOf(body[i]);
    if (idx === -1) return false;
    bits = (bits << 5n) | BigInt(idx);
  }
  if ((bits >> 256n) !== 0n) return false;

  const hex = bits.toString(16).padStart(64, "0");
  const pubKey = Buffer.from(hex, "hex");
  const digest = blake2b(pubKey, undefined, 5).reverse();

  let check = BigInt("0x" + Buffer.from(digest).toString("hex"));
  let encoded = "";
  for (let i = 7; i >= 0; i--) {
    encoded += ALPHABET[Number((check >> BigInt(5 * i)) & 31n)];
  }
  return encoded === body.slice(52);
}
