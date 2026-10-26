import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(packageRoot, 'src');
const publicRoot = path.join(packageRoot, 'public');
const outputRoot = path.join(packageRoot, 'dist');
const sourceFiles = (await readdir(sourceRoot)).filter((name) => name.endsWith('.js')).sort();
if (sourceFiles.length === 0) throw new Error('No JavaScript source files found');

const javascriptFiles = [...sourceFiles.map((name) => path.join(sourceRoot, name)), path.join(publicRoot, 'app.js')];
for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'JavaScript syntax check failed\n');
    process.exitCode = 1;
    break;
  }
}
if (process.exitCode) process.exit(process.exitCode);

const publicFiles = ['index.html', 'app.js', 'styles.css'];
await mkdir(path.join(outputRoot, 'public'), { recursive: true });
for (const name of publicFiles) {
  await copyFile(path.join(publicRoot, name), path.join(outputRoot, 'public', name));
}
process.stdout.write('Build complete: checked ' + javascriptFiles.length + ' JavaScript files and copied ' + publicFiles.length + ' static capability assets.\n');
