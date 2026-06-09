import {
  loadBench,
  createBarChart,
  generateChart,
  withRuntime,
} from "../lib/bench-chart.mjs";

// x-axis groups: payload size → display label (size shown beneath the name).
const SIZES = {
  "64b": "64 B",
  "1k": "1 KB",
  "4k": "4 KB",
  "64k": "64 KB",
  "1m": "1 MB",
};

const OUTPUT_FILE = withRuntime("./charts/blake3.png");

// One array per size: [SWAR, SIMD]. Sizes with no logs on disk are dropped.
const chartData = {};
for (const sz of Object.keys(SIZES)) {
  const swar = loadBench(`blake3-swar-${sz}`);
  const simd = loadBench(`blake3-simd-${sz}`);
  if (!swar && !simd) continue;
  chartData[sz] = [swar, simd].filter(Boolean);
}

if (Object.keys(chartData).length === 0) {
  console.log("No blake3 bench results found - run: npm run bench -- blake3-swar");
  process.exit(0);
}

const config = createBarChart(chartData, SIZES, {
  title: "BLAKE3 throughput: SWAR vs SIMD",
  yLabel: "Throughput (GB/s)",
  xLabel: "",
  metric: "gbps",
  datasetLabels: ["BLAKE3-AS (SWAR)", "BLAKE3-AS (SIMD)"],
});

generateChart(config, OUTPUT_FILE);
