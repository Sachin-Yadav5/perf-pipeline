// Last step: fails the job when a threshold is breached or an error occurred (so the PR check turns red).
const { SUMMARY_FILE, readJson } = require('./common');

const s = readJson(SUMMARY_FILE);
if (!s || s.status !== 'passed') {
  console.error(`Perf test status: ${s ? s.status : 'no summary'}`);
  process.exit(1);
}
console.log('Perf test passed');
