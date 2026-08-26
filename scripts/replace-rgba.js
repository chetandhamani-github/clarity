const fs = require('fs');
const path = require('path');

const replacements = [
  { match: /'rgba\(250, 249, 254, 0\.95\)'/g, replace: 'colors.background + "F2"' },
  { match: /'rgba\(250, 249, 254, 0\.8\)'/g, replace: 'colors.background + "CC"' },
  { match: /'rgba\(120, 86, 0, 0\.1\)'/g, replace: 'colors.primary + "1A"' },
  { match: /'rgba\(120, 86, 0, 0\.05\)'/g, replace: 'colors.primary + "0D"' },
  { match: /'rgba\(120, 86, 0, 0\.02\)'/g, replace: 'colors.primary + "05"' },
  { match: /'rgba\(95, 94, 94, 0\.1\)'/g, replace: 'colors.secondary + "1A"' },
  { match: /'rgba\(91, 92, 89, 0\.1\)'/g, replace: 'colors.tertiary + "1A"' },
  { match: /'rgba\(211, 196, 175, 0\.3\)'/g, replace: 'colors.outlineVariant + "4D"' },
  { match: /'rgba\(211, 196, 175, 0\.5\)'/g, replace: 'colors.outlineVariant + "80"' },
  { match: /'rgba\(238, 237, 243, 0\.5\)'/g, replace: 'colors.surfaceContainer + "80"' },
  { match: /'rgba\(255, 255, 255, 0\.9\)'/g, replace: 'colors.surfaceContainerLowest + "E6"' },
  { match: /'rgba\(255, 255, 255, 0\.8\)'/g, replace: 'colors.surfaceContainerLowest + "CC"' },
  { match: /'rgba\(247, 246, 242, 0\.5\)'/g, replace: 'colors.surfaceContainerLow + "80"' },
  { match: /'rgba\(186, 26, 26, 0\.05\)'/g, replace: 'colors.error + "0D"' },
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      for (const rule of replacements) {
        if (rule.match.test(content)) {
          content = content.replace(rule.match, rule.replace);
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, '..', 'src'));
