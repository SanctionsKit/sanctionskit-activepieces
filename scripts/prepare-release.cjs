const fs = require('node:fs');
const path = require('node:path');
const source = JSON.parse(fs.readFileSync('package.json'));
const manifest = { name: source.name, version: source.version, description: source.description, main: 'bundle/index.js', license: source.license, author: source.author, homepage: source.homepage, repository: source.repository, engines: source.engines, files: ['bundle', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'], dependencies: {}, publishConfig: { access: 'public' } };
fs.mkdirSync('release', { recursive: true });
for (const name of ['bundle', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) fs.cpSync(name, path.join('release', name), { recursive: true });
fs.writeFileSync('release/package.json', JSON.stringify(manifest, null, 2)+'\n');
