export { Hasher } from "./hasher";

import { hashScratch, hashKeyedScratch, deriveKeyScratch } from "./hasher";
import { hashSimdScratch } from "./hasher_simd";

// @ts-expect-error: ASC_FEATURE_SIMD is provided by the compiler.
export const SIMD_ENABLED: bool =
  isDefined(ASC_FEATURE_SIMD) && ASC_FEATURE_SIMD != 0;

// Hash `data` → a new 32-byte digest. Allocates the result; for a GC-free hot
// loop use `hashUnsafe` against reused buffers.
export function hash(data: ArrayBuffer): ArrayBuffer {
  const out = new ArrayBuffer(32);
  hashUnsafe(
    changetype<usize>(data),
    <usize>data.byteLength,
    changetype<usize>(out),
  );
  return out;
}

// Raw, allocation-free: hash `inLen` bytes at `inPtr` into 32 bytes at `outPtr`.
// Dispatches to the SIMD kernel when built with --enable simd, else SWAR.
export function hashUnsafe(inPtr: usize, inLen: usize, outPtr: usize): void {
  if (SIMD_ENABLED) {
    hashSimdScratch(inPtr, inLen, outPtr);
  } else {
    hashScratch(inPtr, inLen, outPtr);
  }
}

export function hashSWAR(inPtr: usize, inLen: usize, outPtr: usize): void {
  hashScratch(inPtr, inLen, outPtr);
}

export function hashKeyed(
  keyPtr: usize,
  inPtr: usize,
  inLen: usize,
  outPtr: usize,
): void {
  hashKeyedScratch(keyPtr, inPtr, inLen, outPtr);
}

export function deriveKey(
  contextPtr: usize,
  contextLen: usize,
  materialPtr: usize,
  materialLen: usize,
  outPtr: usize,
): void {
  deriveKeyScratch(contextPtr, contextLen, materialPtr, materialLen, outPtr);
}
