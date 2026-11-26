import reactNativeConfig from '@react-native/eslint-config/flat';
import prettierConfig from 'eslint-config-prettier/flat';

export default [
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'dist/**',
      '.expo/**',
      'clarity-backend/**',
      'coverage/**',
      'assets/**',
    ],
  },
  ...reactNativeConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-native/no-unused-styles': 'warn',
      'react-native/no-inline-styles': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: [
      '**/*.{spec,test}.{js,jsx,ts,tsx}',
      '**/__{mocks,tests}__/**/*.{js,jsx,ts,tsx}',
    ],
    rules: {
      'react-native/no-inline-styles': 'warn',
    },
  },
  prettierConfig,
];
