// One-off script: merges generated {id, summary} batch files into
// messier.json and caldwell.json as a new "summary" field per object.
// Run once with: node scripts/merge-dso-summaries.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const messierPath = path.join(root, 'src/assets/data/messier.json');
const caldwellPath = path.join(root, 'src/assets/data/caldwell.json');

const batchFiles = [
  '.batch-messier-a.json',
  '.batch-messier-b.json',
  '.batch-caldwell-a.json',
  '.batch-caldwell-b.json',
].map((f) => path.join(root, f));

const summaries = new Map();

for (const file of batchFiles) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const { id, summary } of entries) {
    const key = id.toUpperCase();
    if (summaries.has(key)) {
      console.warn(`Duplicate id ${key} found in ${file}, overwriting.`);
    }
    summaries.set(key, summary);
  }
}

console.log(`Loaded ${summaries.size} summaries from ${batchFiles.length} batch files.`);

// ---------------- messier.json ----------------

const messier = JSON.parse(fs.readFileSync(messierPath, 'utf8'));
let messierMatched = 0;
let messierMissing = [];

for (const [id, obj] of Object.entries(messier.data)) {
  const summary = summaries.get(id.toUpperCase());
  if (summary) {
    obj.summary = summary;
    messierMatched++;
  } else {
    messierMissing.push(id);
  }
}

fs.writeFileSync(messierPath, JSON.stringify(messier, null, 2) + '\n');
console.log(`messier.json: matched ${messierMatched}/${Object.keys(messier.data).length}`);
if (messierMissing.length) console.log('  missing:', messierMissing.join(', '));

// ---------------- caldwell.json ----------------

const caldwell = JSON.parse(fs.readFileSync(caldwellPath, 'utf8'));
let caldwellMatched = 0;
let caldwellMissing = [];

for (const obj of caldwell.data) {
  const id = `${obj.code}${obj.messierNumber}`.toUpperCase();
  const summary = summaries.get(id);
  if (summary) {
    obj.summary = summary;
    caldwellMatched++;
  } else {
    caldwellMissing.push(id);
  }
}

fs.writeFileSync(caldwellPath, JSON.stringify(caldwell, null, 2) + '\n');
console.log(`caldwell.json: matched ${caldwellMatched}/${caldwell.data.length}`);
if (caldwellMissing.length) console.log('  missing:', caldwellMissing.join(', '));
