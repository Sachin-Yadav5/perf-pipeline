// Reads the test config from the ```perf block in the PR description, validates it and writes .perf/out/config.json.
const fs = require('fs');
const yaml = require('js-yaml');
const { CONFIG_FILE, SUMMARY_FILE, writeJson, setOutput } = require('./common');

const MAX_APIS = Number(process.env.PERF_MAX_APIS || 20);
const MAX_TOTAL_USERS = Number(process.env.PERF_MAX_TOTAL_USERS || 500); // all APIs run in parallel, so the load adds up
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const DEFAULTS = { users: 10, duration: 60, max_avg_response_time: 500, max_error_rate: 1 };

function fail(message) {
  console.error('Config error:', message);
  writeJson(SUMMARY_FILE, { status: 'config_error', message, apis: [] });
  setOutput('valid', 'false');
  process.exit(0); // the job continues to the notify step; the last step fails the job
}

function readRaw() {
  const body = (process.env.PR_BODY || '').replace(/<!--[\s\S]*?-->/g, ''); // ignore the commented example in the PR template
  const m = body.match(/```perf[^\n]*\n([\s\S]*?)```/);
  return m ? { raw: m[1], source: 'PR description' } : null;
}

function detectApp() {
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch {}
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.next) return { start: 'node node_modules/next/dist/bin/next start', type: 'next' };
  const s = (pkg.scripts && pkg.scripts.start) || '';
  if (/^node\s+\S+/.test(s) && !/[&|;]/.test(s)) return { start: s.trim(), type: 'node' };
  if (pkg.main) return { start: `node ${pkg.main}`, type: 'node' };
  return { start: 'node index.js', type: 'node' };
}

const found = readRaw();
if (!found) {
  // No perf block in the PR description: this PR does not want a perf test, skip quietly
  console.log('No perf block found in the PR description; skipping.');
  setOutput('skip', 'true');
  setOutput('valid', 'false');
  process.exit(0);
}

let parsed;
try {
  parsed = yaml.load(found.raw);
} catch (e) {
  fail(`Could not parse the YAML: ${e.message.split('\n')[0]}`);
}

const list = Array.isArray(parsed) ? parsed : parsed && parsed.apis;
const appOverride = (!Array.isArray(parsed) && parsed && parsed.app) || {};
if (!Array.isArray(list) || list.length === 0) fail('At least 1 API is required.');
if (list.length > MAX_APIS) fail(`At most ${MAX_APIS} APIs are allowed, found ${list.length}.`);

const apis = [];
const seen = new Set();
list.forEach((raw, i) => {
  const a = raw || {};
  const n = `API #${i + 1}`;
  const method = String(a.method || 'GET').toUpperCase();
  if (typeof a.path !== 'string' || !a.path.startsWith('/')) fail(`${n}: path must start with "/".`);
  if (!METHODS.includes(method)) fail(`${n}: method ${method} is not supported.`);

  const users = Number(a.users ?? DEFAULTS.users);
  const duration = Number(a.duration ?? DEFAULTS.duration);
  const rampUp = Number(a.ramp_up ?? Math.min(10, duration));
  if (!Number.isInteger(users) || users < 1 || users > 500) fail(`${n}: users must be between 1 and 500.`);
  if (!Number.isFinite(duration) || duration < 5 || duration > 600) fail(`${n}: duration must be between 5 and 600 seconds.`);
  if (!Number.isFinite(rampUp) || rampUp < 0 || rampUp > duration) fail(`${n}: ramp_up must be between 0 and duration.`);

  const name = `${method} ${a.path}`;
  if (seen.has(name)) fail(`${n}: "${name}" is listed more than once.`);
  seen.add(name);

  const headers = { ...(a.headers || {}) };
  let body = null;
  if (a.body !== undefined && a.body !== null) {
    body = typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }

  apis.push({
    name,
    path: a.path,
    method,
    users,
    duration,
    ramp_up: rampUp,
    headers,
    body,
    max_avg_response_time: Number(a.max_avg_response_time ?? DEFAULTS.max_avg_response_time),
    max_error_rate: Number(a.max_error_rate ?? DEFAULTS.max_error_rate),
  });
});

const totalUsers = apis.reduce((t, a) => t + a.users, 0);
if (totalUsers > MAX_TOTAL_USERS) fail(`Total users is ${totalUsers}, the limit is ${MAX_TOTAL_USERS} (all APIs run in parallel). Reduce the users.`);

const detected = detectApp();
const app = { ...detected, ...appOverride, port: Number(process.env.PORT || 3000) };

writeJson(CONFIG_FILE, { source: found.source, app, apis });
setOutput('valid', 'true');
console.log(`Config OK (${found.source}): ${apis.map((a) => a.name).join(', ')}`);
console.log(`App start command: ${app.start}`);
