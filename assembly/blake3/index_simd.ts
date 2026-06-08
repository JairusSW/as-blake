import { hashSimdScratch } from "./hasher_simd";

export function hash(inPtr: usize, inLen: usize, outPtr: usize): void {
  hashSimdScratch(inPtr, inLen, outPtr);
}
