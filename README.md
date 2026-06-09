<h1 align="center"><pre>╔╗ ╦  ╔═╗ ╗╔╗╔═╗  ╔═╗╔═╗
╠╩╗║  ╠═╣ ╠╣ ╠═ ══╠═╣╚═╗
╚═╝╚═╝╩ ╩ ╝╚╝╚═╝  ╩ ╩╚═╝</pre></h1>

Portable BLAKE3 for AssemblyScript, with a 128-bit Wasm SIMD fast path for large inputs and a compact SWAR fallback for non-SIMD builds.

`as-blake` exposes BLAKE-family one-shot hashing, raw pointer hashing, keyed hashing, key derivation, and incremental streaming. When compiled with `--enable simd`, large messages use degree-4 SIMD: four BLAKE3 chunks are compressed in parallel inside one `v128`.

<details>
<summary>Table of Contents</summary>

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Performance](#performance)
- [Development](#development)
- [License](#license)
- [Contact](#contact)

</details>

## Install

```bash
npm install as-blake
```

Compile with SIMD for the fast path:

```bash
asc assembly/index.ts --enable simd --enable bulk-memory
```

Compile without SIMD for a SWAR-only binary:

```bash
asc assembly/index.ts --enable bulk-memory
```

The package `asconfig.json` enables SIMD and bulk memory by default.

## Usage

```ts
import { blake3 } from "as-blake";

const digest = blake3.hash(data); // ArrayBuffer -> 32-byte ArrayBuffer
```

For hot paths, write into a caller-owned output buffer:

```ts
import { blake3 } from "as-blake";

blake3.hashUnsafe(inPtr, inLen, outPtr); // writes 32 bytes at outPtr
```

Incremental hashing uses `Hasher`:

```ts
import { blake3 } from "as-blake";

const h = new blake3.Hasher();
h.update(ptr0, len0);
h.update(ptr1, len1);
h.finalize(outPtr);
```

## API

```ts
hash(data: ArrayBuffer): ArrayBuffer;
hashUnsafe(inPtr: usize, inLen: usize, outPtr: usize): void;
hashSWAR(inPtr: usize, inLen: usize, outPtr: usize): void;
hashKeyed(keyPtr: usize, inPtr: usize, inLen: usize, outPtr: usize): void;
deriveKey(
  contextPtr: usize,
  contextLen: usize,
  materialPtr: usize,
  materialLen: usize,
  outPtr: usize,
): void;

class Hasher {
  static create(): Hasher;
  static createKeyed(keyPtr: usize): Hasher;
  static createDeriveKey(contextPtr: usize, contextLen: usize): Hasher;
  update(ptr: usize, len: usize): void;
  finalize(outPtr: usize): void;
}
```

Notes:

- `hash` allocates and returns a 32-byte digest.
- `hashUnsafe`, `hashKeyed`, and `deriveKey` write a 32-byte digest to `outPtr`.
- `hashKeyed` expects a 32-byte key at `keyPtr`.
- `hashSWAR` forces the non-SIMD path even in a SIMD build.
- One-shot scratch-backed functions are not reentrant. Use `Hasher` for independent concurrent instances.
- Inputs are raw `(ptr, len)` pairs into little-endian Wasm memory.

## Performance

Throughput at 1 MiB on an AMD Ryzen 7800X3D:

| runtime | SWAR | SIMD | speedup |
| --- | ---: | ---: | ---: |
| V8 | 845 MB/s | 1926 MB/s | 2.3x |
| WAVM | 957 MB/s | 2954 MB/s | 3.1x |
| wazero | 896 MB/s | 1369 MB/s | 1.5x |

The SIMD path uses a degree-4 kernel above 4 KiB and a degree-2 kernel in the 2-4 KiB range. Smaller inputs use the SWAR stream.

<p align="center">
<img src="https://raw.githubusercontent.com/JairusSW/as-blake/refs/heads/docs/charts/v0.1.0/03-0622499/blake3-wavm.png" alt="dtoa (f64) latency vs the AssemblyScript stdlib, by input complexity">
</p>

## Development

```bash
npm install
npm test
npm run verify
```

Run benchmarks:

```bash
npm run bench -- blake3-swar
npm run bench -- blake3-simd
npm run bench:summary
```

Optional runtime-specific benchmarks:

```bash
npm run bench -- --wavm blake3-simd
npm run bench -- --wazero blake3-simd
```

## License

This project is distributed under an open source license. Work on this project is done by passion, but if you want to support it financially, you can do so by making a donation to the project's [GitHub Sponsors](https://github.com/sponsors/JairusSW) page.

You can view the full license using the following link: [License](./LICENSE)

## Contact

Please send all issues to [GitHub Issues](https://github.com/JairusSW/json-as/issues) and to converse, please send me an email at [me@jairus.dev](mailto:me@jairus.dev)

- **Email:** Send me inquiries, questions, or requests at [me@jairus.dev](mailto:me@jairus.dev)
- **GitHub:** Visit the official GitHub repository [Here](https://github.com/JairusSW/json-as)
- **Website:** Visit my official website at [jairus.dev](https://jairus.dev/)
- **Discord:** Contact me at [My Discord](https://discord.com/users/600700584038760448) or on the [AssemblyScript Discord Server](https://discord.gg/assemblyscript/)
