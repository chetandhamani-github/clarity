const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');

      // regex to match: const getStyles = (colors: ThemeColors) => StyleSheet.create({ ... });
      const pattern =
        /const getStyles = \(colors: ThemeColors\) =>\s*StyleSheet\.create\(\{([\s\S]*?)\}\);/g;

      if (pattern.test(content)) {
        const newContent = content.replace(pattern, (match, body) => {
          return `const getStyles = (colors: ThemeColors) => {\n  const styles = StyleSheet.create({${body}});\n  return styles;\n};`;
        });
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log('Fixed', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, '..', 'src'));
