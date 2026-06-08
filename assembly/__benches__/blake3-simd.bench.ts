import { bench, dumpToFile, blackbox } from "./lib/bench";
import { hash } from "../blake3/index_simd";

const INPUT_1M: usize = memory.data(1024 * 1024);
const OUT: usize = memory.data(32);
{
  for (let i = 0; i < 1024 * 1024; i++) {
    store<u8>(INPUT_1M + <usize>i, <u8>(i % 251));
  }
}

bench(
  "blake3-simd-64b",
  () => {
    hash(INPUT_1M, 64, OUT);
    blackbox(load<u64>(OUT));
  },
  100_000,
  64,
);
dumpToFile("blake3-simd-64b");

bench(
  "blake3-simd-1k",
  () => {
    hash(INPUT_1M, 1024, OUT);
    blackbox(load<u64>(OUT));
  },
  20_000,
  1024,
);
dumpToFile("blake3-simd-1k");

bench(
  "blake3-simd-4k",
  () => {
    hash(INPUT_1M, 4096, OUT);
    blackbox(load<u64>(OUT));
  },
  5_000,
  4096,
);
dumpToFile("blake3-simd-4k");

bench(
  "blake3-simd-64k",
  () => {
    hash(INPUT_1M, 65536, OUT);
    blackbox(load<u64>(OUT));
  },
  500,
  65536,
);
dumpToFile("blake3-simd-64k");

bench(
  "blake3-simd-1m",
  () => {
    hash(INPUT_1M, 1024 * 1024, OUT);
    blackbox(load<u64>(OUT));
  },
  30,
  1024 * 1024,
);
dumpToFile("blake3-simd-1m");
