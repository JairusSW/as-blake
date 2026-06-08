export { Hasher } from "./hasher";

import { hashScratch, hashKeyedScratch, deriveKeyScratch } from "./hasher";
import { hashSimdScratch } from "./hasher_simd";

// @ts-expect-error: ASC_FEATURE_SIMD is provided by the compiler.
export const SIMD_ENABLED: bool =
  isDefined(ASC_FEATURE_SIMD) && ASC_FEATURE_SIMD != 0;

export function hash(inPtr: usize, inLen: usize, outPtr: usize): void {
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
