const fs = require('fs/promises');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const userscriptsDir = path.join(projectRoot, 'src', 'userscripts');
const demoDir = path.join(projectRoot, 'assets', 'demo');
const outputPath = path.join(userscriptsDir, 'userscripts.json');
const rawBaseUrl =
  'https://raw.githubusercontent.com/popstas/userscripts/refs/heads/master/src/userscripts/';

function parseMetadataBlock(content) {
  const headerMatch = content.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!headerMatch) {
    throw new Error('Unable to locate metadata block.');
  }

  const lines = headerMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const meta = {
    match: [],
    grant: [],
  };

  lines.forEach((line) => {
    const match = line.match(/^\/\/\s*@([a-zA-Z0-9_-]+)\s+(.*)$/);
    if (!match) {
      return;
    }

    const [, keyRaw, valueRaw] = match;
    const key = keyRaw.toLowerCase();
    const value = valueRaw.trim();

    switch (key) {
      case 'name':
        meta.name = value;
        break;
      case 'version':
        meta.version = value;
        break;
      case 'description':
        meta.description = value;
        break;
      case 'match':
        if (!meta.match.includes(value)) {
          meta.match.push(value);
        }
        break;
      case 'grant':
        if (!meta.grant.includes(value)) {
          meta.grant.push(value);
        }
        break;
      default:
        break;
    }
  });

  if (!meta.name) {
    throw new Error('Missing required metadata field: name');
  }
  if (!meta.version) {
    throw new Error(`Missing required metadata field: version for ${meta.name}`);
  }
  if (!meta.description) {
    meta.description = '';
  }

  return meta;
}

async function findDemoAssets(baseName) {
  const extensions = ['png', 'gif', 'mp4'];
  const assets = [];

  await Promise.all(
    extensions.map(async (ext) => {
      const candidate = path.join(demoDir, `${baseName}.${ext}`);
      try {
        await fs.access(candidate);
        assets.push(path.relative(projectRoot, candidate).replace(/\\/g, '/'));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    })
  );

  return assets;
}

function ensureUpdateUrl(content, rawUrl) {
  const blockMatch = content.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);

  if (!blockMatch) {
    throw new Error('Unable to locate metadata block.');
  }

  const block = blockMatch[0];
  if (/^\/\/\s*@updateURL\b/m.test(block)) {
    return { content, changed: false };
  }

  const lineEnding = block.includes('\r\n') ? '\r\n' : '\n';
  const closingMarker = `${lineEnding}// ==/UserScript==`;
  const updatedBlock = block.replace(
    closingMarker,
    `${lineEnding}// @updateURL ${rawUrl}${lineEnding}// ==/UserScript==`
  );

  const updatedContent =
    content.slice(0, blockMatch.index) +
    updatedBlock +
    content.slice(blockMatch.index + block.length);

  return { content: updatedContent, changed: true };
}

async function parseUserscripts() {
  const entries = await fs.readdir(userscriptsDir, { withFileTypes: true });
  const scripts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.userscript.js')) {
      continue;
    }

    const filePath = path.join(userscriptsDir, entry.name);
    let content = await fs.readFile(filePath, 'utf8');
    const rawUrl = `${rawBaseUrl}${entry.name}`;
    const { content: ensuredContent, changed } = ensureUpdateUrl(content, rawUrl);

    if (changed) {
      await fs.writeFile(filePath, ensuredContent, 'utf8');
      content = ensuredContent;
    }

    const meta = parseMetadataBlock(content);
    const baseName = entry.name.replace(/\.userscript\.js$/i, '');
    const demoAssets = await findDemoAssets(baseName);

    scripts.push({
      id: baseName,
      file: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
      rawUrl,
      ...meta,
      match: meta.match,
      grant: meta.grant,
      assets: demoAssets,
    });
  }

  scripts.sort((a, b) => a.name.localeCompare(b.name));

  await fs.writeFile(outputPath, `${JSON.stringify(scripts, null, 2)}\n`, 'utf8');

  return scripts;
}

async function main() {
  try {
    const scripts = await parseUserscripts();
    console.log(`Parsed ${scripts.length} userscript${scripts.length === 1 ? '' : 's'}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseUserscripts,
};
