const { parseUserscripts } = require('./parse-userscripts');
const { generateReadme } = require('./generate-readme');
const { spawn } = require('child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function runChangelog() {
  try {
    await runCommand(npmCommand, ['run', 'changelog', '--silent']);
  } catch (error) {
    throw new Error(
      `Failed to generate changelog via conventional-changelog-cli. ${error.message}`
    );
  }
}

async function build() {
  await parseUserscripts();
  await generateReadme();
  await runChangelog();
}

async function main() {
  try {
    await build();
    console.log('Build complete.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  build,
};
