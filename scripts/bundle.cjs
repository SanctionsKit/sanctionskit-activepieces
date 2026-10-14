const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const result = await esbuild.build({ entryPoints: ['src/index.ts'], outfile: 'bundle/index.js', bundle: true, platform: 'node', format: 'cjs', target: 'node22', mainFields: ['module', 'main'], minify: true, metafile: true, legalComments: 'linked' });
  const externals = Object.values(result.metafile.outputs).flatMap(output => output.imports).filter(item => item.external && !require('node:module').builtinModules.includes(item.path) && !item.path.startsWith('node:'));
  if (externals.length) throw new Error('Bundle has unresolved package dependencies: '+JSON.stringify(externals));
  fs.mkdirSync('.build', { recursive: true });
  fs.writeFileSync('.build/metafile.json', JSON.stringify(result.metafile, null, 2)+'\n');
  const roots = new Set();
  for (const name of Object.keys(result.metafile.inputs)) {
    const parts = name.split('/'); const index = parts.lastIndexOf('node_modules');
    if (index < 0) continue;
    roots.add(parts.slice(0, index+(parts[index+1].startsWith('@') ? 3 : 2)).join('/'));
  }
  const notices = [];
  for (const root of [...roots].sort()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    const file = fs.readdirSync(root).find(name => /^licen[sc]e(?:\.md|\.txt)?$/i.test(name));
    notices.push(`${pkg.name}@${pkg.version}\nLicense: ${pkg.license ?? 'See included notice'}\n${file ? fs.readFileSync(path.join(root,file),'utf8') : (pkg.name.startsWith('@activepieces/') ? fs.readFileSync('licenses/activepieces-MIT.txt', 'utf8') : 'See package source license before publication.')}`);
  }
  fs.writeFileSync('THIRD_PARTY_NOTICES.txt', notices.join('\n\n====================\n\n')+'\n');
  const source = JSON.parse(fs.readFileSync('package.json'));
  fs.writeFileSync('.build/runtime-package.json', JSON.stringify({ name:source.name, version:source.version, dependencies:{}, bundledDependencies:[], buildFramework:'@activepieces/pieces-framework@0.32.0' },null,2)+'\n');
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
