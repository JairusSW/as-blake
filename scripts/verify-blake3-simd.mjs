#!/usr/bin/env node
// Cross-validates our SIMD AssemblyScript BLAKE3 against @noble/hashes.
// Focuses on lengths ≥ 4096 where the SIMD path activates.

import { blake3 } from "@noble/hashes/blake3.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function loadWasm(name) {
  const wasm = readFileSync(join(root, `build/${name}`));
  const mod = await WebAssembly.compile(wasm);
  const instance = await WebAssembly.instantiate(mod, {
    env: {
      abort: () => {
        throw new Error("wasm abort");
      },
    },
  });
  return instance.exports;
}

const [swar, simd] = await Promise.all([
  loadWasm("blake3-verify.wasm"),
  loadWasm("blake3-simd-verify.wasm"),
]);

function allocAndFill(exports, size) {
  const ptr = exports.__new(size, 0);
  const mem = new Uint8Array(exports.memory.buffer);
  for (let i = 0; i < size; i++) mem[ptr + i] = i % 251;
  return ptr;
}

// Allocate in each WASM module
const maxLen = 65536 + 32;
const swarIn = allocAndFill(swar, maxLen);
const simdIn = allocAndFill(simd, maxLen);
const swarOut = swar.__new(32, 0);
const simdOut = simd.__new(32, 0);

// Test lengths: focus on ≥ 4096 (SIMD path), also check boundaries
const testLens = [
  0,
  1,
  64,
  1023,
  1024,
  1025,
  2048,
  2049,
  3072,
  3073,
  4096,
  4097,
  4096 + 1024,
  6144,
  7168,
  8192,
  8193,
  16383,
  16384,
  16385,
  32767,
  32768,
  32769,
  65535,
  65536,
];

let pass = 0,
  fail = 0;
for (const len of testLens) {
  // Reference: noble/hashes
  const input = new Uint8Array(len);
  for (let i = 0; i < len; i++) input[i] = i % 251;
  const expected = blake3(input);

  // SWAR (non-SIMD) WASM
  swar.hashUnsafe(swarIn, len, swarOut);
  const swarResult = new Uint8Array(swar.memory.buffer, swarOut, 32);

  // SIMD WASM
  simd.hashUnsafe(simdIn, len, simdOut);
  const simdResult = new Uint8Array(simd.memory.buffer, simdOut, 32);

  const simdMatch = expected.every((b, i) => b === simdResult[i]);
  const swarMatch = expected.every((b, i) => b === swarResult[i]);
  const agree = [...simdResult].every((b, i) => b === swarResult[i]);

  if (simdMatch && swarMatch) {
    pass++;
    process.stdout.write(len >= 4096 ? "S" : ".");
  } else {
    fail++;
    const hex = (a) =>
      [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
    console.error(
      `\nFAIL len=${len} swarOk=${swarMatch} simdOk=${simdMatch} agree=${agree}`,
    );
    console.error(`  expected: ${hex(expected)}`);
    console.error(`  swar:   ${hex(swarResult)}`);
    console.error(`  simd:     ${hex(simdResult)}`);
  }
}

console.log(`\n\n(. = swar only, S = SIMD path)`);
console.log(`SIMD cross-validation: ${pass}/${testLens.length} passed`);
if (fail > 0) process.exit(1);
