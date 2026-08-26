import { Project, SyntaxKind, FunctionDeclaration, ArrowFunction, Node } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths('src/**/*.tsx');

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  if (filePath.includes('/theme/') || filePath.includes('/store/')) continue;

  const text = sourceFile.getFullText();
  if (!text.includes('colors.light')) continue;

  console.log(`Processing ${filePath}`);

  // 1. Add import { useTheme } from '@/theme';
  let themeImport = sourceFile.getImportDeclaration(
    (decl) => decl.getModuleSpecifierValue() === '@/theme'
  );

  if (themeImport) {
    const namedImports = themeImport.getNamedImports().map((i) => i.getName());
    if (!namedImports.includes('useTheme')) {
      themeImport.addNamedImport('useTheme');
    }
    if (!namedImports.includes('ThemeColors')) {
      themeImport.addNamedImport('ThemeColors');
    }
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@/theme',
      namedImports: ['useTheme', 'ThemeColors'],
    });
  }

  // 2. Change const styles = StyleSheet.create(...)
  const variableDeclarations = sourceFile.getVariableDeclarations();
  let stylesDecl = variableDeclarations.find((v) => v.getName() === 'styles');
  if (stylesDecl) {
    const initializer = stylesDecl.getInitializer();
    if (
      initializer &&
      Node.isCallExpression(initializer) &&
      initializer.getExpression().getText() === 'StyleSheet.create'
    ) {
      const args = initializer.getArguments();
      if (args.length > 0) {
        const stylesObject = args[0].getText();
        const newInitializer = `(colors: ThemeColors) => StyleSheet.create(${stylesObject})`;
        stylesDecl.rename('getStyles');
        stylesDecl.setInitializer(newInitializer);
      }
    }
  }

  // 3. Find the main component and insert useTheme
  // Try to find default export function or arrow function
  let mainComponent: FunctionDeclaration | ArrowFunction | undefined;

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const decl = defaultExport.getDeclarations()[0];
    if (Node.isFunctionDeclaration(decl)) {
      mainComponent = decl;
    } else if (Node.isVariableDeclaration(decl)) {
      const init = decl.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        mainComponent = init as ArrowFunction;
      }
    }
  }

  // Fallback to first exported function
  if (!mainComponent) {
    const exportedFunctions = sourceFile.getFunctions().filter((f) => f.isExported());
    if (exportedFunctions.length > 0) {
      mainComponent = exportedFunctions[0];
    } else {
      const exportedVars = sourceFile.getVariableDeclarations().filter((v) => v.hasExportKeyword());
      for (const v of exportedVars) {
        const init = v.getInitializer();
        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          mainComponent = init as ArrowFunction;
          break;
        }
      }
    }
  }

  if (mainComponent) {
    const body = mainComponent.getBody();
    if (body && Node.isBlock(body)) {
      // Check if already injected
      if (!body.getText().includes('useTheme()')) {
        body.insertStatements(0, 'const styles = getStyles(colors);');
        body.insertStatements(0, 'const { colors } = useTheme();');
      }
    }
  }

  // 4. Replace colors.light with colors everywhere
  let newText = sourceFile.getFullText();
  newText = newText.replace(/colors\.light/g, 'colors');
  sourceFile.replaceWithText(newText);
}

project.saveSync();
console.log('Done refactoring');
