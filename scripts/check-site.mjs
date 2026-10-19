import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, dirname, relative, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Local artifact inspection only. No network calls and no asset contents in output.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = process.argv[2] ? resolve(process.argv[2]) : join(repository, 'site-dist');
const checks = [];
const check = (id, ok, details = {}) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', details });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [];
let unsafeEntry = false;
let inspectionError = false;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) { unsafeEntry = true; continue; }
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files.push(path);
    else unsafeEntry = true;
  }
}
try {
  if (!(await lstat(site)).isDirectory()) throw new Error('NotDirectory');
  await walk(site);
} catch { inspectionError = true; }
files.sort();
const data = new Map();
for (const file of files) {
  try { data.set(relative(site, file).split(sep).join('/'), await readFile(file)); }
  catch { inspectionError = true; }
}
const texts = [...data].filter(([name]) => new Set(['.js', '.css', '.html', '.json', '.webmanifest', '.svg']).has(extname(name)));
const js = [...data].filter(([name]) => extname(name) === '.js');
const allJS = js.map(([, bytes]) => bytes.toString('utf8')).join('\n');
const text = (name) => data.get(name)?.toString('utf8') ?? '';
const parse = (name) => { try { return JSON.parse(text(name)); } catch { return null; } };
check('production-api-present', allJS.includes('https://new.carezaar.com/api/'), { jsFiles: js.length });
check('no-source-maps', !inspectionError && ![...data.keys()].some((name) => extname(name) === '.map') && !texts.some(([, bytes]) => bytes.includes('sourceMappingURL=')), { scope: 'All shipped text assets, including scenes' });
for (const [name, pattern] of [
  ['secret-material', /AKIA[0-9A-Z]{16}|sk_(?:live|test)_[0-9a-zA-Z]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|eyJhbGciOi[A-Za-z0-9_-]{20,}/],
  ['finite-qa-markers', /qa-request-counts|qa\.public\.language|qa\.final\.extension|synthetic-recovery@example\.test|QA_EMAIL|QA_PASSWORD|carezaar-language-regression|__qa_/],
  ['dev-catalog', /DesignCatalog|design-catalog/],
]) {
  const hitFiles = texts.filter(([, bytes]) => pattern.test(bytes.toString('utf8'))).map(([file]) => file);
  check(`absent-${name}`, !inspectionError && hitFiles.length === 0, { hitFiles, finitePatternScanOnly: true });
}
check('no-production-console-debug', !inspectionError && !/\bconsole\s*\.\s*(?:log|debug|info)\s*\(|\bdebugger\b|\balert\s*\(/.test(allJS), { scope: 'All shipped JavaScript; warnings/errors retained; finite textual predicate, not JS semantic analysis' });
const manifest = parse('manifest.webmanifest');
const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
check('manifest', manifest?.name === 'Carezaar' && manifest?.start_url === '/main/matches' && icons.length === 2, { expectedIcons: 2 });
function localAsset(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)) return null;
  const name = path.slice(1);
  if (name.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return data.get(name) ?? null;
}
for (const size of [192, 512]) {
  const matches = icons.filter((icon) => icon?.sizes === `${size}x${size}`);
  const icon = matches[0];
  const bytes = localAsset(icon?.src);
  const isPNG = bytes?.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = isPNG ? bytes.readUInt32BE(16) : null;
  const height = isPNG ? bytes.readUInt32BE(20) : null;
  check(`manifest-icon-${size}`, matches.length === 1 && icon?.type === 'image/png' && isPNG && width === size && height === size, { width, height, expectedSize: size });
}
const og = text('app.html').match(/property="og:image" content="([^"]+)"/)?.[1];
check('relative-share-image', localAsset(og) !== null);
for (const file of ['app.html', 'index.html']) {
  check(`html-metadata-${file}`, [/<html lang="en"/, /<title>[^<]+<\/title>/, /name="description"/, /name="viewport"/].every((pattern) => pattern.test(text(file))), { file });
}
const config = parse('vercel.json');
const globalHeaders = Array.isArray(config?.headers) ? config.headers.filter((entry) => entry?.source === '/(.*)') : [];
const headers = Array.isArray(globalHeaders[0]?.headers) ? globalHeaders[0].headers : [];
const keys = Object.fromEntries(headers.filter((header) => typeof header?.key === 'string').map((header) => [header.key, header.value]));
check('production-csp-config', globalHeaders.length === 1 && typeof keys['Content-Security-Policy'] === 'string' && keys['Content-Security-Policy'].includes("object-src 'none'") && keys['X-Frame-Options'] === 'DENY' && keys['X-Content-Type-Options'] === 'nosniff', { configuredGlobalHeaderKeys: Object.keys(keys).sort(), liveDeploymentNotClaimed: true });
check('no-test-source-directories', !inspectionError && !unsafeEntry && data.size > 0 && ![...data.keys()].some((name) => name.split('/').some((part) => ['tests', 'test-evidence', 'qa', 'node_modules'].includes(part))), { shippedFiles: data.size, unreadableOrUnsupportedEntry: inspectionError || unsafeEntry });
const result = {
  status: checks.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL',
  checks,
  artifactTreeSHA256: sha([...data].map(([name, bytes]) => `${name}:${sha(bytes)}`).join('\n')),
  deploymentPerformed: false,
  scope: 'Local artifact only; finite text marker scans are not complete secret/privacy/security certification. CSP is configured, not live-deployment verified.',
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.status === 'PASS' ? 0 : 1;
