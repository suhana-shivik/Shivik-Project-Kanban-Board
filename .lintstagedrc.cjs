const path = require('node:path');

function eslintIn(projectDir, configFile) {
  const bin = path.resolve(__dirname, projectDir, 'node_modules/.bin/eslint');
  const config = path.resolve(__dirname, projectDir, configFile);
  return (files) => `"${bin}" --config "${config}" --fix ${files.map((f) => `"${f}"`).join(' ')}`;
}

module.exports = {
  'Material/backend/**/*.ts': eslintIn('Material/backend', 'eslint.config.mjs'),
  'Kanban-Board/**/*.{js,ts,tsx}': eslintIn('Kanban-Board', 'eslint.config.js'),
  // Material/frontend has no eslint config yet, so it's intentionally left out here.
};
