const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const code = fs.readFileSync(
  '/home/lalit/Documents/Clarity/src/app/(app)/budget-setup.tsx',
  'utf-8'
);

try {
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  console.log('Parsed successfully?!');
} catch (e) {
  console.log('Syntax Error at line', e.loc.line, 'col', e.loc.column);
  console.log(e.message);

  // Print some context
  const lines = code.split('\n');
  const start = Math.max(0, e.loc.line - 5);
  const end = Math.min(lines.length, e.loc.line + 5);
  for (let i = start; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
