import { hashSimdScratch } from "./hasher_simd";

export function hashUnsafe(inPtr: usize, inLen: usize, outPtr: usize): void {
  hashSimdScratch(inPtr, inLen, outPtr);
}
