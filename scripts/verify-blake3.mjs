#!/usr/bin/env node
// Cross-validates our AssemblyScript BLAKE3 against @noble/hashes.
// Run: node scripts/verify-blake3.mjs

import { blake3 } from "@noble/hashes/blake3.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = readFileSync(join(root, "build/blake3-verify.wasm"));
const mod = await WebAssembly.compile(wasm);

const instance = await WebAssembly.instantiate(mod, {
  env: {
    abort: () => {
      throw new Error("wasm abort");
    },
  },
});

const { exports } = instance;
// The AS stub runtime exports `memory`. Use it to read/write.
const buf = exports.memory.buffer;
const mem = new Uint8Array(buf);

// Module statics occupy the low part of memory. To avoid collisions, use
// __new() to allocate buffers in the WASM heap.
function allocBytes(n) {
  // AS stub runtime __new(size, id): id=1 = Uint8Array-ish, but for raw memory id doesn't matter
  const ptr = exports.__new(n, 0);
  return ptr;
}

// Allocate input (max 4096 + 1 bytes) and output (32 bytes)
const IN_PTR = allocBytes(4097);
const OUT_PTR = allocBytes(32);

// Fill input with the official BLAKE3 test pattern: i % 251
for (let i = 0; i <= 4096; i++) mem[IN_PTR + i] = i % 251;

const testLens = [
  0, 1, 2, 7, 63, 64, 65, 127, 128, 129, 255, 256, 511, 512, 1023, 1024, 1025,
  2048, 2049, 4096,
];

let pass = 0,
  fail = 0;
for (const len of testLens) {
  const input = new Uint8Array(len);
  for (let i = 0; i < len; i++) input[i] = i % 251;
  const expected = blake3(input);

  exports.hash(IN_PTR, len, OUT_PTR);
  const got = new Uint8Array(buf, OUT_PTR, 32);

  const match = expected.every((b, i) => b === got[i]);
  if (match) {
    pass++;
    process.stdout.write(".");
  } else {
    fail++;
    const hex = (a) =>
      [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
    console.error(`\nFAIL len=${len}`);
    console.error(`  expected: ${hex(expected)}`);
    console.error(`  got:      ${hex(got)}`);
  }
}

console.log(`\n\nBlake3 cross-validation: ${pass}/${testLens.length} passed`);
if (fail > 0) process.exit(1);
