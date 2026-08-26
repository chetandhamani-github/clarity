const fs = require('fs');
const path = require('path');

const replacements = [
  { match: /'#FAF9FE'/gi, replace: 'colors.background' },
  { match: /"#FAF9FE"/gi, replace: '{colors.background}' },

  { match: /'#FEFCF8'/gi, replace: 'colors.surfaceContainerLowest' },
  { match: /"#FEFCF8"/gi, replace: '{colors.surfaceContainerLowest}' },

  { match: /'#F7F6F2'/gi, replace: 'colors.surfaceContainerLow' },
  { match: /"#F7F6F2"/gi, replace: '{colors.surfaceContainerLow}' },

  { match: /'#F4F3F8'/gi, replace: 'colors.surfaceContainerLow' },
  { match: /"#F4F3F8"/gi, replace: '{colors.surfaceContainerLow}' },

  { match: /'#EEEDF3'/gi, replace: 'colors.surfaceContainer' },
  { match: /"#EEEDF3"/gi, replace: '{colors.surfaceContainer}' },

  { match: /'#F0EFEA'/gi, replace: 'colors.surfaceContainer' },
  { match: /"#F0EFEA"/gi, replace: '{colors.surfaceContainer}' },

  { match: /'#B8860B'/gi, replace: 'colors.primary' },
  { match: /"#B8860B"/gi, replace: '{colors.primary}' },

  { match: /'#E5E4E0'/gi, replace: 'colors.outlineVariant' },
  { match: /"#E5E4E0"/gi, replace: '{colors.outlineVariant}' },

  { match: /'#6B7280'/gi, replace: 'colors.onSurfaceVariant' },
  { match: /"#6B7280"/gi, replace: '{colors.onSurfaceVariant}' },

  { match: /color:\s*'#1A1A1A'/gi, replace: 'color: colors.onSurface' },
  { match: /color="#1A1A1A"/gi, replace: 'color={colors.onSurface}' },

  { match: /borderColor:\s*'#1A1A1A'/gi, replace: 'borderColor: colors.outline' },

  { match: /backgroundColor:\s*'#1A1A1A'/gi, replace: 'backgroundColor: colors.onBackground' },
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
