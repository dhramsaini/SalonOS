// Opens tests.html in headless Chrome against a local copy of the site and fails if any
// self-test fails. Usage: node tools/run-tests.mjs   (needs: npm i puppeteer)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/+/, '')) || 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
let exitCode = 1;
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/tests.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__salonosTestResults || /Could not|timed out/.test(document.getElementById("sum").innerText)', { timeout: 90000 });
  const results = await page.evaluate(() => window.__salonosTestResults || null);
  if (!results) throw new Error(await page.evaluate(() => document.getElementById('sum').innerText));
  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `  (expected ${JSON.stringify(r.want)}, got ${JSON.stringify(r.got)})`}`);
  console.log(`${results.length - failed.length} of ${results.length} tests passed`);
  exitCode = failed.length ? 1 : 0;
} catch (e) {
  console.error('Test run failed: ' + (e && e.message || e));
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
