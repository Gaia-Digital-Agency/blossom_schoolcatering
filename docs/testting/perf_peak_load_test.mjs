const base = process.env.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const targetPath = process.env.PERF_PATH || '/health';
const totalRequests = Number(process.env.PERF_TOTAL || 300);
const concurrency = Number(process.env.PERF_CONCURRENCY || 30);
const timeoutMs = Number(process.env.PERF_TIMEOUT_MS || 10000);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function oneRequest(url) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const ms = Date.now() - start;
    return { ok: res.ok, status: res.status, ms };
  } catch {
    const ms = Date.now() - start;
    return { ok: false, status: 0, ms };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const url = `${base}${targetPath}`;
  const queue = Array.from({ length: totalRequests }, () => url);
  const results = [];

  async function worker() {
    while (queue.length) {
      queue.pop();
      // eslint-disable-next-line no-await-in-loop
      const r = await oneRequest(url);
      results.push(r);
    }
  }

  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedMs = Date.now() - started;

  const latencies = results.map((x) => x.ms).sort((a, b) => a - b);
  const okCount = results.filter((x) => x.ok).length;
  const failCount = results.length - okCount;
  const rps = results.length / (elapsedMs / 1000);

  const report = {
    generatedAt: new Date().toISOString(),
    target: url,
    config: { totalRequests, concurrency, timeoutMs },
    summary: {
      total: results.length,
      ok: okCount,
      failed: failCount,
      successRate: Number(((okCount / Math.max(1, results.length)) * 100).toFixed(2)),
      durationMs: elapsedMs,
      requestsPerSecond: Number(rps.toFixed(2)),
      latencyMs: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        p99: percentile(latencies, 99),
        max: latencies[latencies.length - 1] || 0,
      },
    },
  };

  console.log(JSON.stringify(report, null, 2));

  // default gate: 99% success, p95 < 1500ms
  if (report.summary.successRate < 99 || report.summary.latencyMs.p95 > 1500) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(JSON.stringify({ fatal: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exit(1);
});
