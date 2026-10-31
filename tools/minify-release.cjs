const fs = require('node:fs');
const path = require('node:path');
const terser = require('terser');
const CleanCSS = require('clean-css');

const root = path.resolve(process.argv[2] || '');
if (!root || !fs.existsSync(root)) throw new Error('Usage: node tools/minify-release.cjs <web-public-directory>');

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

(async () => {
  for (const file of walk(root)) {
    const extension = path.extname(file).toLowerCase();
    if (extension === '.map') {
      fs.rmSync(file);
      continue;
    }
    if (extension === '.js' || extension === '.mjs') {
      const source = fs.readFileSync(file, 'utf8');
      const result = await terser.minify(source, {
        module: extension === '.mjs',
        compress: {passes: 2, drop_console: true},
        mangle: true,
        format: {comments: false},
      });
      if (!result.code) throw new Error(`Minification produced no output: ${file}`);
      fs.writeFileSync(file, result.code);
    } else if (extension === '.css') {
      const source = fs.readFileSync(file, 'utf8');
      const result = new CleanCSS({level: 2}).minify(source);
      if (result.errors.length) throw new Error(`${file}: ${result.errors.join('; ')}`);
      fs.writeFileSync(file, result.styles);
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
