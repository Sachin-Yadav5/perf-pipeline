// Reads the Clinic.js doctor binary processstat data and returns avg / peak CPU (%) and memory (RSS, MB).
const fs = require('fs');
const path = require('path');

const round = (n) => Math.round(n * 100) / 100;

async function readClinicMetrics(clinicDir) {
  if (!fs.existsSync(clinicDir)) return null;
  const dataDir = fs.readdirSync(clinicDir).find((f) => f.endsWith('.clinic-doctor') && fs.statSync(path.join(clinicDir, f)).isDirectory());
  if (!dataDir) return null;
  const statFile = path.join(clinicDir, dataDir, `${dataDir}-processstat`);
  if (!fs.existsSync(statFile)) return null;

  let Decoder;
  try {
    Decoder = require(require.resolve('@clinic/doctor/format/process-stat-decoder.js', { paths: [__dirname] }));
  } catch (e) {
    console.error('Could not load the Clinic decoder:', e.message);
    return null;
  }

  const rows = await new Promise((resolve, reject) => {
    const out = [];
    fs.createReadStream(statFile)
      .pipe(new Decoder())
      .on('data', (d) => out.push(d))
      .on('end', () => resolve(out))
      .on('error', reject);
  }).catch((e) => {
    console.error('Clinic data parse error:', e.message);
    return [];
  });
  if (!rows.length) return null;

  const cpu = rows.map((r) => r.cpu * 100); // Clinic stores CPU as a fraction
  const mem = rows.map((r) => r.memory.rss / 1024 / 1024);
  const avg = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  const max = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
  return {
    samples: rows.length,
    cpu: { avg: round(avg(cpu)), peak: round(max(cpu)) },
    memory: { avg: round(avg(mem)), peak: round(max(mem)) },
  };
}

module.exports = { readClinicMetrics };
