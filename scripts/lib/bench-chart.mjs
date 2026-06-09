// Shared helpers for chart-building scripts under scripts/charts/*.mjs.
// Runtime is selected by the BENCH_CHART_RUNTIME env var (set by
// scripts/build-charts.sh from --v8/--wavm/--wazero flags). Default: v8.
//
// Chart design ported from json-as/scripts/lib/bench-utils.ts.
//
// Each chart .mjs file:
//   1. import { loadBench, createBarChart, generateChart } from "../lib/bench-chart.mjs"
//   2. assemble a Record<groupLabel, BenchResult[]> + a label map
//   3. createBarChart + generateChart(withRuntime("./charts/<name>.png"))

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { MODE_BARS, INK } from "./palette.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const LOGS_DIR = path.join(ROOT, "build", "logs", "as");

const RAW_RUNTIME = (process.env.BENCH_CHART_RUNTIME ?? "v8")
  .trim()
  .toLowerCase();
export const RUNTIME = ["v8", "wavm", "wazero"].includes(RAW_RUNTIME)
  ? RAW_RUNTIME
  : "v8";

/** Read a single bench JSON (returns null if missing). */
export function loadBench(stem) {
  const p = path.join(LOGS_DIR, RUNTIME, `${stem}.as.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Bulk load - returns { stem: payload } for every stem found. Stems missing
 *  on disk are silently omitted; check `.length` if completeness matters. */
export function loadResults(stems) {
  const out = {};
  for (const stem of stems) {
    const v = loadBench(stem);
    if (v) out[stem] = v;
  }
  return out;
}

/** Git/version subtitle. Best-effort - silently degrades if shell commands fail. */
export function subtitle() {
  const tokens = [new Date().toDateString()];
  try {
    const v = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ).version;
    if (v && v !== "0.0.0") tokens.push("v" + v);
  } catch {}
  try {
    tokens.push(
      "git " +
        execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
    );
  } catch {}
  tokens.push("runtime: " + RUNTIME);
  return tokens.join(" • ");
}

/**
 * Build a grouped-bar chart config.
 *
 * `data` shape: `{ <groupLabel>: BenchResult[] }` — one array per x-axis group,
 * one bar per array entry (series).
 * `groupLabels` maps a group key to its display label (multi-line allowed).
 *
 * `opts.metric` picks the field to plot — default "mbps". Use "gbps" for GB/s.
 */
export function createBarChart(data, groupLabels = {}, opts = {}) {
  const groupKeys = Object.keys(data);
  if (groupKeys.length === 0) throw new Error("createBarChart: no groups");
  const labels = groupKeys.map((k) => groupLabels[k] ?? k);
  const metric = opts.metric ?? "mbps";

  const values = Object.values(data)
    .flat()
    .map((r) => r?.[metric] ?? 0);
  const maxVal = Math.max(...values);

  // Round up to the next step above (tallest bar + half a step), so there is
  // always headroom for the value label above the highest bar.
  const yStep = opts.yStep ?? niceStep(maxVal);
  const yMax = Math.ceil((maxVal + yStep / 2) / yStep) * yStep;

  const datasetNames = opts.datasetLabels ?? [];
  const palette = opts.colors ?? MODE_BARS;
  const numDatasets = Math.max(...groupKeys.map((k) => data[k].length));

  return {
    type: "bar",
    data: {
      labels,
      datasets: Array.from({ length: numDatasets }, (_, i) => ({
        label: datasetNames[i] ?? `Series ${i + 1}`,
        data: groupKeys.map((k) => data[k][i]?.[metric] ?? 0),
        backgroundColor: palette[i % palette.length].bg,
        borderColor: palette[i % palette.length].border,
        borderWidth: 1,
      })),
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: !!opts.title,
          text: opts.title,
          font: { size: 20, weight: "bold" },
        },
        legend: {
          position: "top",
          labels: {
            font: { size: 16, weight: "bold" },
            padding: 20,
          },
        },
        datalabels: {
          anchor: "end",
          align: opts.labelAlign ?? "end",
          rotation: opts.labelRotation ?? 0,
          offset: opts.labelOffset ?? 4,
          color: INK.label,
          font: { weight: "bold", size: opts.labelFontSize ?? 12 },
          formatter: opts.labelFormatter ?? ((v) => v.toFixed(2)),
        },
        subtitle: {
          display: true,
          text: opts.subtitle ?? subtitle(),
          font: { size: 14, weight: "bold" },
          color: INK.subtitle,
          padding: 16,
          position: "right",
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: yMax,
          title: {
            display: true,
            text: opts.yLabel ?? metricLabel(metric),
            font: { size: 16, weight: "bold" },
          },
          ticks: {
            stepSize: yStep,
            font: { size: 14, weight: "bold" },
          },
        },
        x: {
          title: {
            display: !!opts.xLabel,
            text: opts.xLabel ?? "",
            font: { size: 16, weight: "bold" },
          },
          ticks: {
            maxRotation: 0,
            minRotation: 0,
            font: { size: 14, weight: "bold" },
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  };
}

/** Pick a round y-axis step that yields ~6-10 ticks for the given max. */
function niceStep(max) {
  if (max <= 0) return 1;
  const raw = max / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function metricLabel(metric) {
  if (metric === "mbps") return "Throughput (MB/s)";
  if (metric === "gbps") return "Throughput (GB/s)";
  if (metric === "nsPerOp") return "ns/op";
  if (metric === "opsPerSecond") return "ops/s";
  return metric;
}

/** Render a Chart.js config to PNG (3x density) or SVG. Returns the output path. */
export function generateChart(config, outPath) {
  const abs = path.isAbsolute(outPath) ? outPath : path.join(ROOT, outPath);
  const isSvg = abs.endsWith(".svg");

  // Render raster (PNG) charts at 3x pixel density: the logical 1000x600 layout
  // becomes a crisp 3000x1800 image with identical proportions/fonts. SVG is
  // vector — resolution-independent — so it's left untouched.
  if (!isSvg) {
    config.options = { ...(config.options ?? {}), devicePixelRatio: 3 };
  }

  const canvas = new ChartJSNodeCanvas({
    width: 1000,
    height: 600,
    type: isSvg ? "svg" : "png",
    chartCallback: (ChartJS) => ChartJS.register(ChartDataLabels),
  });

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const buffer = canvas.renderToBufferSync(
    config,
    isSvg ? "image/svg+xml" : "image/png",
  );
  fs.writeFileSync(abs, buffer);
  console.log("wrote", path.relative(ROOT, abs));
  return abs;
}

/** Append `-<runtime>` before the extension. `/x/chart.png` → `/x/chart-v8.png`. */
export function withRuntime(outPath) {
  const ext = path.extname(outPath);
  return outPath.slice(0, -ext.length) + "-" + RUNTIME + ext;
}
