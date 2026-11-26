// Reads the JMeter results.jtl (CSV), computes avg / p95 / error rate per API and compares them with the thresholds.
const fs = require('fs');
const path = require('path');
const { OUT, CONFIG_FILE, SUMMARY_FILE, readJson, writeJson } = require('./common');
const { readClinicMetrics } = require('./clinic-metrics');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const cfg = readJson(CONFIG_FILE);
const jtl = path.join(OUT, 'results.jtl');

if (!fs.existsSync(jtl) || fs.statSync(jtl).size === 0) {
  writeJson(SUMMARY_FILE, {
    status: 'run_error',
    message: 'No load test results were produced. The app did not start or JMeter failed; check the workflow logs.',
    apis: [],
  });
  console.error('No JTL results');
  process.exit(0);
}

const [header, ...data] = parseCsv(fs.readFileSync(jtl, 'utf8')).filter((r) => r.length > 1);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const byLabel = {};
for (const r of data) {
  const label = r[col.label];
  (byLabel[label] ||= []).push({
    ts: Number(r[col.timeStamp]),
    elapsed: Number(r[col.elapsed]),
    ok: r[col.success] === 'true',
  });
}

const apis = cfg.apis.map((a) => {
  const s = byLabel[a.name] || [];
  const reasons = [];
  if (!s.length) {
    return { name: a.name, users: a.users, samples: 0, passed: false, reasons: ['No requests were sent'], limits: limits(a) };
  }
  const el = s.map((x) => x.elapsed).sort((p, q) => p - q);
  const avg = el.reduce((t, v) => t + v, 0) / el.length;
  const errors = s.filter((x) => !x.ok).length;
  const errorRate = (errors / s.length) * 100;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const x of s) { // a spread (...) over hundreds of thousands of samples overflows the stack, so use a loop
    if (x.ts < tMin) tMin = x.ts;
    if (x.ts + x.elapsed > tMax) tMax = x.ts + x.elapsed;
  }
  const span = (tMax - tMin) / 1000;
  if (avg > a.max_avg_response_time) reasons.push(`avg ${round(avg, 0)}ms > ${a.max_avg_response_time}ms`);
  if (errorRate > a.max_error_rate) reasons.push(`errors ${round(errorRate, 2)}% > ${a.max_error_rate}%`);
  return {
    name: a.name,
    users: a.users,
    samples: s.length,
    avg: round(avg, 0),
    p95: percentile(el, 0.95),
    max: el[el.length - 1],
    errorRate: round(errorRate, 2),
    rps: span > 0 ? round(s.length / span, 1) : null,
    limits: limits(a),
    passed: reasons.length === 0,
    reasons,
  };
});

function limits(a) {
  return { avg: a.max_avg_response_time, errorRate: a.max_error_rate };
}

// Overall JMeter totals (samples of the configured APIs only)
const all = cfg.apis.flatMap((a) => byLabel[a.name] || []);
const failed = all.filter((x) => !x.ok).length;
const totals = {
  requests: all.length,
  avg: all.length ? round(all.reduce((t, x) => t + x.elapsed, 0) / all.length, 2) : 0,
  failed,
  errorRate: all.length ? round((failed / all.length) * 100, 2) : 0,
};

const status = apis.every((a) => a.passed) ? 'passed' : 'failed';

readClinicMetrics(path.join(OUT, 'clinic')).then((clinic) => {
  writeJson(SUMMARY_FILE, { status, totals, clinic, apis });
  console.log(`Analysis: ${status}`);
  console.log(` Totals: ${totals.requests} req, avg ${totals.avg}ms, failed ${totals.failed}`);
  if (clinic) console.log(` CPU avg/peak ${clinic.cpu.avg}/${clinic.cpu.peak}% | RSS avg/peak ${clinic.memory.avg}/${clinic.memory.peak} MB`);
  else console.log(' Clinic metrics not found');
  apis.forEach((a) => console.log(` ${a.passed ? 'PASS' : 'FAIL'} ${a.name} avg=${a.avg}ms p95=${a.p95}ms err=${a.errorRate}% ${a.reasons.join('; ')}`));
});
