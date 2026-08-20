module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular imports make change impact hard to reason about.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'material-kanban-boundary',
      comment: 'Material and Kanban-Board are independent products and must not import from each other.',
      severity: 'error',
      from: { path: '^Material' },
      to: { path: '^Kanban-Board' },
    },
    {
      name: 'kanban-material-boundary',
      comment: 'Material and Kanban-Board are independent products and must not import from each other.',
      severity: 'error',
      from: { path: '^Kanban-Board' },
      to: { path: '^Material' },
    },
    {
      name: 'material-frontend-no-backend-import',
      comment: 'The Material frontend must talk to the backend over HTTP, not by importing its source.',
      severity: 'error',
      from: { path: '^Material/frontend' },
      to: { path: '^Material/backend' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)(dist|build|coverage|\\.next)(/|$)',
    },
  },
};
