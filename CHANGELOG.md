# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## [0.1.0] - 2026-06-08

First release. Portable, SIMD-accelerated BLAKE3 for AssemblyScript.

### Added
- BLAKE3 hashing: friendly `hash(ArrayBuffer)`, the allocation-free `hashUnsafe`
  (raw pointers), plus `hashKeyed`, `deriveKey`, and a streaming `Hasher`.
- Two compression paths - **SWAR** (8×u64 message loads) and **SIMD** (degree-4 above 4 KiB plus a degree-2 kernel for the 2–4 KiB band, via 128-bit Wasm SIMD).
- `hash` dispatches to SIMD or SWAR **at compile time** from the
  `ASC_FEATURE_SIMD` flag; a no-SIMD build dead-code-eliminates the v128 kernel
  (zero `v128` opcodes, ~10 KB). `hashSWAR` remains importable
  directly.
- Namespaced family root `assembly/index.ts` exposing the `blake3` namespace;
  sibling BLAKE2 namespaces are planned.
- Cross-runtime benchmarks (V8, WAVM, wazero) and a chart pipeline
  (`scripts/charts/blake3.mjs`). SIMD degree-4 reaches ~2.95 GB/s on WAVM.
- Correctness: official BLAKE3 test vectors in-wasm, plus cross-validation of
  the SWAR and SIMD paths against `@noble/hashes`.

[0.1.0]: https://github.com/JairusSW/blake-as/releases/tag/v0.1.0
