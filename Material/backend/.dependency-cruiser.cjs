module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'repository-no-service-or-controller',
      comment: 'Repositories are the data-access layer and must not depend upward on services or controllers.',
      severity: 'error',
      from: { path: '\\.repository\\.ts$' },
      to: { path: '\\.(service|controller)\\.ts$' },
    },
    {
      name: 'controller-no-repository',
      comment: 'Controllers must go through a service, not call repositories directly.',
      severity: 'error',
      from: { path: '\\.controller\\.ts$' },
      to: { path: '\\.repository\\.ts$' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)(dist|test)(/|$)',
    },
  },
};
