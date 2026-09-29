// Static checks for SalonOS, run on every push (see .github/workflows/checks.yml).
//  1. every js/ file listed in index.html parses as a classic script
//  2. no top-level name is declared in two files (a runtime "already been declared" error)
//  3. nothing runs at load time using a name declared in a LATER file (the files are separate
//     classic scripts sharing one global scope, loaded in index.html order)
//  4. APP_VERSION (js/01-foundation.js) == version.json == every ?v= in index.html
// Usage: node tools/check.mjs   (exit code 1 on any problem)
import fs from 'node:fs';
import * as acorn from 'acorn';

const errors = [];
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script src="(js\/[^"?]+\.js)\?v=([^"]+)"/g)].map(m => ({ file: m[1], v: m[2] }));
if (!scripts.length) errors.push('index.html references no js/ files');
const onDisk = fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f);
for (const f of onDisk) if (!scripts.some(s => s.file === f)) errors.push(`${f} exists but index.html does not load it`);

// Versions
const version = JSON.parse(fs.readFileSync('version.json', 'utf8')).version;
const appVersion = (fs.readFileSync('js/01-foundation.js', 'utf8').match(/const APP_VERSION='([^']*)'/) || [])[1];
if (appVersion !== version) errors.push(`APP_VERSION (${appVersion}) != version.json (${version})`);
for (const s of scripts) if (s.v !== version) errors.push(`${s.file}?v=${s.v} != version.json (${version})`);

// Parse + collect top-level declarations and load-time references
const declared = new Map(); // name -> file index
const parsed = [];
scripts.forEach((s, i) => {
  const src = fs.readFileSync(s.file, 'utf8');
  try { parsed.push({ i, file: s.file, ast: acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) }); }
  catch (e) { errors.push(`${s.file}: syntax error — ${e.message}`); }
});
const namesIn = (pattern, out) => {
  if (!pattern) return;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(p => namesIn(p.value || p.argument, out));
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(e => namesIn(e, out));
  else if (pattern.type === 'AssignmentPattern') namesIn(pattern.left, out);
  else if (pattern.type === 'RestElement') namesIn(pattern.argument, out);
};
const lexical = new Map(); // name -> file index, for const/let/class (redeclaring these across scripts throws)
for (const { i, file, ast } of parsed) {
  for (const n of ast.body) {
    const names = [];
    const isLexical = n.type === 'ClassDeclaration' || (n.type === 'VariableDeclaration' && n.kind !== 'var');
    if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') names.push(n.id.name);
    else if (n.type === 'VariableDeclaration') n.declarations.forEach(d => namesIn(d.id, names));
    for (const name of names) {
      const clash = (isLexical && declared.has(name) && declared.get(name) !== i) || (lexical.has(name) && lexical.get(name) !== i);
      if (clash) errors.push(`'${name}' is declared in both ${scripts[declared.get(name)].file} and ${file} (const/let/class names must be unique)`);
      if (!declared.has(name)) declared.set(name, i);
      if (isLexical && !lexical.has(name)) lexical.set(name, i);
    }
  }
}
const loadRefs = (node, out) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(x => loadRefs(x, out)); return; }
  if (['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration', 'ClassBody'].includes(node.type)) return; // runs later
  if (node.type === 'Identifier') { out.push(node); return; }
  if (node.type === 'MemberExpression') { loadRefs(node.object, out); if (node.computed) loadRefs(node.property, out); return; }
  if (node.type === 'Property') { if (node.computed) loadRefs(node.key, out); loadRefs(node.value, out); return; }
  for (const k of Object.keys(node)) if (!['type', 'start', 'end', 'loc'].includes(k)) loadRefs(node[k], out);
};
for (const { i, file, ast } of parsed) {
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration') continue;
    const refs = [];
    if (n.type === 'VariableDeclaration') n.declarations.forEach(d => loadRefs(d.init, refs)); else loadRefs(n, refs);
    for (const r of refs) {
      const at = declared.get(r.name);
      if (at !== undefined && at > i) errors.push(`${file}:${r.loc.start.line} uses '${r.name}' at load time, but it is declared later in ${scripts[at].file}`);
    }
  }
}

if (errors.length) { console.error('✗ ' + errors.length + ' problem(s):\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log(`✓ ${scripts.length} files parsed, ${declared.size} top-level names, load order OK, version ${version} consistent`);
