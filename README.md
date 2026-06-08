<h1 align="center"><pre>
╔╗ ╦  ╔═╗ ╗╔╗╔═╗  ╔═╗╔═╗
╠╩╗║  ╠═╣ ╠╣ ╠═ ══╠═╣╚═╗
╚═╝╚═╝╩ ╩ ╝╚╝╚═╝  ╩ ╩╚═╝</pre></h1>

<p align="center">Portable, SIMD-accelerated BLAKE3 for AssemblyScript - a single message hashed across 4 chunks in lockstep, ~3× a single-stream baseline with no AVX, no hardware crypto, just 128-bit Wasm SIMD.</p>

<details>
<summary>Table of Contents</summary>

- [Why](#why)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
  - [One-shot hashing](#one-shot-hashing)
  - [Keyed hashing & key derivation](#keyed-hashing--key-derivation)
  - [Streaming](#streaming)
  - [Calling convention](#calling-convention)
- [Performance](#performance)
  - [Benchmarks](#benchmarks)
  - [Cross-runtime](#cross-runtime)
  - [Picking a path](#picking-a-path)
  - [Running benchmarks locally](#running-benchmarks-locally)
  - [Charts](#charts)
- [Architecture](#architecture)
  - [Why degree-4 (and why it works on one message)](#why-degree-4-and-why-it-works-on-one-message)
  - [The rotation tax](#the-rotation-tax)
  - [Why SWAR doesn't help](#why-swar-doesnt-help)
  - [Allocation-free one-shot](#allocation-free-one-shot)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

</details>

## Why

[BLAKE3](https://github.com/BLAKE3-team/BLAKE3) is a Merkle-tree hash: the input is split into 1 KiB **chunks**, each chunk is compressed independently, and the resulting chaining values are folded up a binary tree to the root. That tree is the whole point - unlike a sequential chaining hash ([SHA-256](https://en.wikipedia.org/wiki/SHA-2), BLAKE2), where one message's blocks are a hard serial dependency, BLAKE3's chunks are **independent**, so a *single* message has parallelism baked in. Put four chunks in the four lanes of a `v128` and advance them in lockstep, and you accelerate one hash - no batch of messages required.

This repo ports BLAKE3 to AssemblyScript two ways and benches them across three runtimes:

- **SWAR** - fully-unrolled 7-round compression with `load<u64>` message loads (8 loads, two 32-bit words each); `rotr<u32>` lowers to a single `i32.rotr`. The non-SIMD baseline.
- **SIMD degree-4** - 4 chunks compressed simultaneously in `v128` SoA layout, the structure of the official [Rust/C `hash_many`](https://github.com/BLAKE3-team/BLAKE3) reduced to the 128-bit Wasm SIMD subset (no vector rotate, no AVX).

Throughput @ 1 MiB, SIMD degree-4 vs the SWAR baseline:

| runtime | SWAR (1 stream) | SIMD degree-4 | speedup |
|---|---:|---:|---:|
| V8 (TurboFan JIT)    | 845 MB/s | **1926 MB/s** | **2.3×** |
| WAVM (LLVM AOT)      | 957 MB/s | **2954 MB/s** | **3.1×** |
| wazero (Go compiler) | 896 MB/s | **1369 MB/s** | **1.5×** |

Every digest is byte-for-byte correct against the official BLAKE3 test vectors and cross-checked against [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) over a length sweep that crosses every chunk and tree boundary. The honest caveat: the degree-4 fast path needs **≥4 chunks** (>4 KiB), and a degree-2 fast path covers the **2–4 KiB** band; below ~2 KiB it runs the SWAR stream, which is already ~0.85–0.95 GB/s.

## Installation

Not on npm yet - clone the repo and either copy `assembly/blake3/` into your project, or add a path alias to your `asconfig.json`:

```jsonc
{
  "options": {
    "paths": {
      "blake-as/*": ["./path/to/this/repo/assembly/blake3/*"]
    }
  }
}
```

The single `hash` entry point dispatches at compile time, so the SIMD flag is the only knob. SIMD on (the fast path):

```bash
--enable simd --enable bulk-memory
```

…or build SIMD off and the same source folds to a SWAR-only binary (the degree-4 kernel is dead-code-eliminated - ~10 KB, zero `v128` opcodes):

```bash
--enable bulk-memory
```

If you run a post-`asc` `wasm-opt` pass on a SIMD build, it needs `--enable-simd` too - Binaryen validates SIMD separately.

## Usage

```ts
import { hash, hashKeyed, deriveKey } from "./blake3";

// One entry point. `hash` picks its kernel at COMPILE TIME from the SIMD flag:
//   built WITH  --enable simd → degree-4 SIMD (SWAR stream below 4 chunks)
//   built WITHOUT simd        → SWAR stream (zero v128 opcodes in the binary)
hash(inPtr, len, outPtr);   // 32-byte digest at outPtr, zero allocation
```

You never pick a kernel by hand - the same source builds both ways. All entry points are pointer-in / pointer-out and **allocation-free** - no `Hasher` object is created per call, so a hot loop is GC-free.

## API

### One-shot hashing

```ts
// assembly/blake3/index.ts - one dispatching entry + direct kernels.
hash(inPtr: usize, inLen: usize, outPtr: usize): void       // DISPATCHES: SIMD if --enable simd, else SWAR
hashSWAR(inPtr: usize, inLen: usize, outPtr: usize): void   // force SWAR     - 8×u64 message loads

// Compile-time flag, if you want to branch yourself:
const SIMD_ENABLED: bool  // = isDefined(ASC_FEATURE_SIMD) && ASC_FEATURE_SIMD != 0
```

`outPtr` must point at 32 writable bytes. `hash` is the one you want - it dispatches to the degree-4 SIMD kernel when the build enables SIMD (using it once the input is ≥4 complete chunks, SWAR below that) and to the plain SWAR stream otherwise. `hashSWAR` forces the non-SIMD stream regardless of the build.

### Keyed hashing & key derivation

The two other BLAKE3 modes, exported allocation-free from `index.ts`:

```ts
hashKeyed(keyPtr: usize, inPtr: usize, inLen: usize, outPtr: usize): void
deriveKey(contextPtr: usize, contextLen: usize, materialPtr: usize, materialLen: usize, outPtr: usize): void
```

- `hashKeyed` reads a 32-byte key at `keyPtr` and hashes under the `KEYED_HASH` domain.
- `deriveKey` hashes the context string under `DERIVE_KEY_CONTEXT`, then hashes the material under `DERIVE_KEY_MATERIAL` with that as the key - the standard KDF construction.

### Streaming

For incremental input, the class-based `Hasher` (and `HasherSimd`) remain available:

```ts
import { Hasher } from "./blake3";

const h = new Hasher();
h.update(ptr0, len0);
h.update(ptr1, len1);
h.finalize(outPtr);
// Hasher.createKeyed(keyPtr) / Hasher.createDeriveKey(ctxPtr, ctxLen) for the other modes.
```

The one-shot functions above are scratch-backed (module-global state + `memory.data` buffers) and therefore **not reentrant** - they assume one active hash at a time, which matches the benchmark model. Reach for the `Hasher` class if you need independent concurrent instances.

### Calling convention

- **Inputs** are `(ptr, len)` into raw little-endian Wasm memory; BLAKE3 is little-endian, so no byte-swapping is needed.
- **Outputs** are 32-byte digests written to `outPtr`. The XOF (variable-length output) is not exposed - every entry point emits the standard 256-bit digest.
- **Empty input is valid** (`len = 0` hashes the empty string).

## Performance

### Benchmarks

Throughput in MB/s, Apple Silicon, swept across message sizes. `SWAR` is single-stream; `SIMD` engages the degree-4 kernel above 4 KiB and a degree-2 kernel in the 2–4 KiB band, falling back to the SWAR stream below ~2 KiB.

| variant | V8 (JIT) | WAVM (LLVM AOT) | wazero (Go) |
|---|---:|---:|---:|
| SWAR @ 64 B     | 763 | 918 | 678 |
| SIMD @ 64 B     | 743 | 926 | 665 |
| SWAR @ 1 MiB    | 845 | 957 | 896 |
| **SIMD @ 1 MiB**| **1926** | **2954** | **1369** |

<p align="center"><img src="https://raw.githubusercontent.com/JairusSW/blake-as/refs/heads/docs/charts/v0.1.0/01-5a0ec64/blake3-wavm.png" alt="BLAKE3 throughput - SWAR vs SIMD degree-4 (WAVM)" width="820"></p>

The degree-4 win only shows up once the input is several chunks deep (note how SWAR and SIMD are identical at 64 B - both running the same stream - and diverge past 4 KiB as the SIMD kernel kicks in).

### Cross-runtime

The same `.wasm` behaves very differently across compilers, and SIMD is where the gap is widest:

- **WAVM (LLVM AOT) leads** - its register allocator handles the kernel's 32 live `v128` values (16 state + 16 message, against 16 XMM registers) far better than the JITs, reaching **2954 MB/s**.
- **wazero trails on SIMD specifically** - its non-SIMD codegen is on par with the others (~0.9 GB/s), but its v128 backend caps the degree-4 path at ~1.37 GB/s.
- **wasmer**, if you have it: its **Cranelift** backend beats its own **LLVM** backend on this SIMD kernel by ~40% (2038 vs 1458 MB/s @ 64 KiB) - wasmer's LLVM SIMD codegen is notably weaker than WAVM's. Singlepass can't run it at all (no SIMD support).

Three optimization attempts that *regressed every runtime* and were reverted: a message-word scratch buffer, fully unrolling the 16-block loop, and shift-based rotations. The compact rolled loop with shuffle rotations is the portable optimum.

### Picking a path

| you have… | reach for |
|---|---|
| any input (just hash it) | `hash` - dispatches to degree-4 SIMD past 4 KiB if the build has SIMD, else SWAR |
| force SWAR regardless of build | `hashSWAR` |
| a keyed MAC | `hashKeyed` |
| a KDF | `deriveKey` |
| incremental / streaming input | the `Hasher` class |

### Running benchmarks locally

```bash
npm install
npm run bench -- blake3-swar
npm run bench -- blake3-simd
npm run bench:summary               # markdown table from build/logs/as/<runtime>/
```

Multi-runtime - pass `--wavm` or `--wazero` (binaries need to be in PATH); SIMD flags are wired in automatically for the `blake3-simd` bench:

```bash
npm run bench -- --wavm blake3-simd
npm run bench -- --wazero blake3-simd
```

### Charts

The chart embedded above is served from the `docs` branch, not committed to `main`. `scripts/charts/blake3.mjs` reads `build/logs/as/<runtime>/blake3-{swar,simd}-*.as.json` and emits one grouped bar chart per runtime → `charts/blake3-<runtime>.png` (gitignored). `npm run charts:publish` re-runs the benches, renders the charts, pushes them to `docs` under `charts/v<version>/<NN>-<sha>/`, and re-pins the README `<img>` URL to that path. Build locally without publishing via `npm run charts:build`.

## Architecture

```
assembly/blake3/
  constants.ts       - IV[8], domain flags, MSG_SCHEDULE[7][16], BLOCK_LEN=64, CHUNK_LEN=1024
  compress.ts        - SWAR compress (8×u64 loads), 7 rounds fully unrolled, all G inline
  compress_simd.ts   - compress4Chunks / compress2Chunks: SoA v128 state, 4×4 transpose
  hasher.ts          - chunk state machine: block buffer, CV stack, tree merge (SWAR)
  hasher_simd.ts     - same, plus the 4-chunk SIMD fast path in update()
  index.ts           - dispatching API: hash (SIMD/SWAR by compile flag) + hashSWAR / hashKeyed / deriveKey
  index_simd.ts      - explicit SIMD-only hash entry (--enable simd); index.ts dispatches to the same kernel
assembly/__tests__/
  blake3.spec.ts     - official vectors over a length sweep crossing chunk/tree boundaries
assembly/__benches__/
  blake3-swar.bench.ts · blake3-simd.bench.ts
scripts/
  verify-blake3.mjs       - cross-check the SWAR path vs @noble/hashes (20 lengths)
  verify-blake3-simd.mjs  - cross-check SIMD vs @noble/hashes (19 lengths, incl. multi-chunk)
  charts/blake3.mjs
```

### Why degree-4 (and why it works on one message)

BLAKE3 splits input into 1 KiB chunks; each chunk is `CV = compress_chain(key, 16 blocks)` and is **independent of every other chunk**. The degree-4 kernel (`compress4Chunks`) loads four chunks into the four 32-bit lanes of each `v128`, holds the 16-word state as 16 `v128` rows in **structure-of-arrays** layout (row *i* = word *i* of all four chunks), and runs all 7 rounds once - producing four chunk CVs per call. The four CVs are then folded into the Merkle tree by the hasher. Because the parallelism comes from the *tree*, not from a batch of inputs, this accelerates a single large hash - the thing multi-buffer SHA-256 can't do.

Getting four chunks' message words into SoA needs a 4×4 `i32` transpose per block (eight `v128.shuffle`s per 4-word tile); the hasher's `update()` takes the SIMD path while it's at a chunk boundary with **>4 chunks** remaining, so the final chunk is always left for `finalize()` to tag with the `ROOT` flag. Once fewer than four chunks remain, a **degree-2** kernel (`compress2Chunks`) handles two at a time — it reuses the same body with chunks 0/1 duplicated into the two spare lanes — so the 2–4 KiB band gets a partial SIMD win instead of dropping straight to SWAR.

### The rotation tax

BLAKE3's G function rotates by 16, 12, 8, 7. The 128-bit Wasm SIMD subset has **no vector rotate**, so:

- `rotr16` / `rotr8` - one `i8x16.shuffle` each (a byte permutation does these for free).
- `rotr12` / `rotr7` - `shr_u | shl | or`, three ops each.

That 3-op rotate is the entire reason the realistic degree-4 win lands at ~2–3× aggregate rather than the 4× the lane count suggests - and why a native build with `vprold` (AVX-512) or even SSE leaves Wasm behind. The SWAR path, by contrast, lowers each `rotr<u32>` to a single `i32.rotr`.

### Why SWAR doesn't help

The non-SIMD path loads message words as `load<u64>` (8 loads instead of 16), but that's the only thing "SWAR" about it. BLAKE3's core is 32-bit modular addition, and you **cannot** pack two of those into a 64-bit lane: the carry from the low add bleeds into the high lane. The rotates cross the 32-bit boundary too. So true SWAR arithmetic is impossible - the `u64` loads just get re-split by the compiler, and the path runs at plain single-lane speed. It's the honest non-SIMD baseline; the bottleneck is the G-function mixing, not message loading.

### Allocation-free one-shot

The exported one-shot functions route through module-level scratch state instead of allocating a `Hasher` object per call. This makes short-input hashing **40–80% faster** (a 64 B hash on WAVM went 513 → 920 MB/s once the per-call object allocation was gone) and the hot loop GC-free. Two smaller wins ride along: the redundant `memory.fill` of the block buffer after each compression is dropped (only the final block needs zero-padding, done in `finalize`), and parent-node merging compresses the two child CVs **in place** from the CV stack - since they're adjacent, `compressCV(IV, left, …)` reads the contiguous `left‖right` 64-byte block directly, saving two 32-byte copies per merge.

## Testing

```bash
npm test                              # in-wasm vectors (as-test)
node scripts/verify-blake3.mjs        # SWAR vs @noble/hashes
node scripts/verify-blake3-simd.mjs   # SIMD vs @noble/hashes, incl. multi-chunk
```

Coverage:

- **In-wasm** (`blake3.spec.ts`) - the official BLAKE3 digests for a length sweep `{0, 1, 2, 63, 64, 65, 127, 128, 129, …}` that exercises the empty input, exact block/chunk multiples, and the first multi-chunk tree.
- **Cross-validation** - `verify-blake3.mjs` checks the SWAR path against `@noble/hashes` over 20 lengths (0…4096); `verify-blake3-simd.mjs` checks the SIMD path over 19 lengths including every exact multiple of 4 KiB (where the degree-4 fast path and `ROOT`-flag handoff are most fragile).

All green: 15 in-wasm tests, 20/20 SWAR, 19/19 SIMD.

## Contributing

This is a personal playground but PRs are welcome - open an issue first if it's a non-trivial change so we can sync on the approach. Run `npm test`, both `verify-blake3*.mjs` scripts, and `npm run bench -- --wavm blake3-simd` before submitting; the multi-runtime bench delta is a useful thing to include in the PR description.

## License

MIT - feel free to use, modify, or build on this. Work on it is done out of curiosity; if you want to support it you can sponsor me on [GitHub Sponsors](https://github.com/sponsors/JairusSW).

## Contact

- **Email:** [me@jairus.dev](mailto:me@jairus.dev)
- **GitHub:** [@JairusSW](https://github.com/JairusSW)
- **Website:** [jairus.dev](https://jairus.dev/)
- **Discord:** [profile](https://discord.com/users/600700584038760448) or the [AssemblyScript Discord](https://discord.gg/assemblyscript/)
