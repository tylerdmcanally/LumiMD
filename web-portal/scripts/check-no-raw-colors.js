const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGET_DIRS = ['app', 'components', 'lib'];
const FILE_EXTENSIONS = ['.tsx'];
const RAW_COLOR_REGEX =
  /\b(bg|text|border|ring|fill|stroke)-(red|amber|yellow|green|emerald|blue|indigo|purple|pink|teal|cyan|sky|orange|lime|rose|gray|slate|zinc|neutral)(-[0-9]{2,3})?\b/;

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(fullPath, fileList);
    } else if (FILE_EXTENSIONS.includes(path.extname(entry.name))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function findRawColorsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const matches = [];

  lines.forEach((line, index) => {
    if (RAW_COLOR_REGEX.test(line)) {
      matches.push({ line: index + 1, content: line.trim() });
    }
  });

  return matches;
}

function main() {
  const files = TARGET_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const violations = [];

  files.forEach((filePath) => {
    const matches = findRawColorsInFile(filePath);
    if (matches.length > 0) {
      violations.push({ filePath, matches });
    }
  });

  if (violations.length > 0) {
    console.error('Raw Tailwind colors detected. Use semantic tokens instead:\n');
    violations.forEach(({ filePath, matches }) => {
      console.error(`- ${path.relative(ROOT, filePath)}`);
      matches.forEach((match) => {
        console.error(`  L${match.line}: ${match.content}`);
      });
      console.error('');
    });
    process.exit(1);
  }

  console.log('No raw Tailwind colors found.');
}

main();
