module.exports = function (api) {
  api.cache(true);
  const isProd = process.env.NODE_ENV === 'production';
  return {
    presets: ['babel-preset-expo'],
    plugins: isProd
      ? [
          function () {
            return {
              visitor: {
                CallExpression(path) {
                  const callee = path.node.callee;
                  if (
                    callee.type === 'MemberExpression' &&
                    callee.object.name === 'console' &&
                    ['log', 'info', 'debug'].includes(callee.property.name)
                  ) {
                    path.remove();
                  }
                },
              },
            };
          },
        ]
      : [],
  };
};

