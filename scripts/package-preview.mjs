import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const buildDirectory = join(root, 'dist-preview');
let html = await readFile(join(buildDirectory, 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
if (!script || !stylesheet) throw new Error('Build the project before packaging the preview.');
const javascript = await readFile(join(buildDirectory, script[1]), 'utf8');
const css = await readFile(join(buildDirectory, stylesheet[1]), 'utf8');
const favicon = await readFile(join(root, 'public/favicon.svg'), 'utf8');
html = html.replace(script[0], () => '<script type="module">' + javascript.replaceAll('</script', '<\\/script') + '</script>');
html = html.replace(stylesheet[0], () => '<style>' + css.replaceAll('</style', '<\\/style') + '</style>');
html = html.replace('/favicon.svg', 'data:image/svg+xml;base64,' + Buffer.from(favicon).toString('base64'));
await writeFile(join(root, 'talent-preview.html'), html);
console.log('Created talent-preview.html — a self-contained preview with no server required.');
