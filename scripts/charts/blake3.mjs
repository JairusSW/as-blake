import {
  loadBench,
  createBarChart,
  generateChart,
  withRuntime,
  subtitle,
} from "../lib/bench-chart.mjs";

const SIZES = ["64b", "1k", "4k", "64k", "1m"];

const data = {};
for (const sz of SIZES) {
  const swar = loadBench(`blake3-swar-${sz}`);
  const simd = loadBench(`blake3-simd-${sz}`);
  if (!swar && !simd) continue;
  data[sz] = {};
  if (swar) data[sz]["swar"] = swar;
  if (simd) data[sz]["simd"] = simd;
}

if (Object.keys(data).length === 0) {
  console.log("No blake3 bench results found - run: npm run bench -- blake3-swar");
  process.exit(0);
}

generateChart(
  createBarChart(data, {
    title: "BLAKE3 throughput: SWAR vs SIMD degree-4 (AssemblyScript)",
    subtitle: subtitle(),
    metric: "gbps",
    yLabel: "GB/s",
    labelFormatter: (v) => v.toFixed(2),
  }),
  withRuntime("./charts/blake3.png"),
  { width: 1280, height: 720 },
);
