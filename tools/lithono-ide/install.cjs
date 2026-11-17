const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const EXT_ID = 'lithono.ide';
const VERSION = require('./package.json').version;
const SOURCE = __dirname;
const DEST_NAME = `${EXT_ID}-${VERSION}`;
const EXT_DIR = path.join(os.homedir(), '.cursor', 'extensions');
const DEST = path.join(EXT_DIR, DEST_NAME);
const REGISTRY = path.join(EXT_DIR, 'extensions.json');

fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SOURCE, DEST, {
  recursive: true,
  filter: (file) => !file.endsWith('install.cjs'),
});

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const next = registry.filter((entry) => entry.identifier?.id !== EXT_ID);
next.push({
  identifier: { id: EXT_ID },
  version: VERSION,
  location: {
    $mid: 1,
    path: DEST,
    scheme: 'file',
  },
  relativeLocation: DEST_NAME,
});
fs.writeFileSync(REGISTRY, JSON.stringify(next));
console.log(`Installed ${EXT_ID} → ${DEST}`);
