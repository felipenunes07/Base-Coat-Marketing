import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const patterns = [/meta_ads_metrics/g, /from\(['"]meta_ads_metrics['"]\)/g];
const allowedPrefixes = [
  'README.md',
  'SECURITY_FIX.md',
  'LOOM_SCRIPT.md',
  `docs${sep}`,
  `src${sep}app${sep}dashboard-app.tsx`,
  `src${sep}lib${sep}source-performance.ts`,
  `supabase${sep}migrations${sep}`,
  `tests${sep}security${sep}`,
  `scripts${sep}scan-meta-ads-metrics-usage.mjs`
];
const ignoredDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage']);
const findings = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) {
      continue;
    }

    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }

    const pathFromRoot = relative(root, absolutePath);
    const content = await readFile(absolutePath, 'utf8');

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const line = content.slice(0, match.index).split(/\r?\n/).length;
        findings.push({ file: pathFromRoot, line, text: match[0] });
      }
    }
  }
}

function isAllowed(file) {
  return allowedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix));
}

await walk(root);

const unsafeFindings = findings.filter((finding) => !isAllowed(finding.file));

for (const finding of findings) {
  const status = isAllowed(finding.file) ? 'allowed' : 'review';
  console.log(`${status}: ${finding.file}:${finding.line} ${finding.text}`);
}

if (unsafeFindings.length > 0) {
  console.error(`Found ${unsafeFindings.length} unreviewed meta_ads_metrics references.`);
  process.exit(1);
}

console.log('No unreviewed meta_ads_metrics references found.');
