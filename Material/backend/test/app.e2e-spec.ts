import { api, loginAsAdmin } from './api';

/** Smoke tests against a running API — health, auth and the RBAC boundary. */
jest.setTimeout(60_000);

describe('API (e2e)', () => {
  let token = '';

  // decided by globalSetup, because `it.skip` is chosen while this describe
  // body runs — long before any beforeAll hook could set a flag
  const available = process.env.E2E_AVAILABLE === 'true';
  const runIf = () => (available ? it : it.skip);

  beforeAll(async () => {
    if (!available) return;
    token = await loginAsAdmin();
    if (!token) throw new Error('e2e: could not sign in as the admin account');
  });
  const auth = () => ({ Authorization: `Bearer ${token}` });

  runIf()(
    'answers the liveness probe without touching the database',
    async () => {
      const response = await api().get('/api/health/live');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    },
  );

  runIf()('reports database and cache on the readiness probe', async () => {
    const response = await api().get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.database.status).toBe('up');
    // 'down' is allowed — the app is still ready without Redis
    expect(['up', 'down', 'disabled']).toContain(response.body.cache.status);
  });

  runIf()(
    'signs in and returns a token with resolved permissions',
    async () => {
      const response = await api()
        .post('/api/auth/login')
        .send({ email: 'suhana@gmail.com', password: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeTruthy();
      expect(response.body.user.role).toBe('admin');
      expect(response.body.user.permissions).toContain('user:create');
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    },
  );

  runIf()(
    'refuses a wrong password without saying which half was wrong',
    async () => {
      const response = await api()
        .post('/api/auth/login')
        .send({ email: 'suhana@gmail.com', password: 'nope' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid email or password');
    },
  );

  runIf()('refuses an unauthenticated request', async () => {
    const response = await api().get('/api/materials');

    expect(response.status).toBe(401);
  });

  runIf()('refuses a tampered token', async () => {
    const response = await api()
      .get('/api/materials')
      .set({ Authorization: 'Bearer not.a.real.token' });

    expect(response.status).toBe(401);
  });

  runIf()('lets a viewer read but not write', async () => {
    const login = await api()
      .post('/api/auth/login')
      .send({ email: 'viewer@gmail.com', password: '123456' });

    const viewer = { Authorization: `Bearer ${login.body.accessToken}` };

    await expect(
      api()
        .get('/api/materials')
        .set(viewer)
        .then((r) => r.status),
    ).resolves.toBe(200);

    const write = await api().post('/api/materials').set(viewer).send({
      name: 'Should not exist',
      code: 'E2E-NOPE',
      categoryId: 1,
      uom: 'nos',
      hsn: '1',
      gst: '5%',
    });

    expect(write.status).toBe(403);
    // the 403 names what was missing rather than leaving the caller guessing
    expect(write.body.requiredPermissions).toBe('material:create');
  });

  runIf()('serves the public routes without a token', async () => {
    for (const path of [
      '/api/auth/roles',
      '/api/users/lookups',
      '/api/roles/colors',
    ]) {
      const response = await api().get(path);
      expect(response.status).toBe(200);
    }
  });

  runIf()('pages a list only when asked', async () => {
    const plain = await api().get('/api/departments').set(auth());
    expect(Array.isArray(plain.body)).toBe(true);

    const paged = await api()
      .get('/api/departments')
      .set(auth())
      .query({ page: 1, limit: 2 });

    expect(Array.isArray(paged.body)).toBe(false);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.total).toBeGreaterThanOrEqual(2);
    expect(paged.body.page).toBe(1);
  });

  runIf()('reports a validation failure as named fields', async () => {
    const response = await api()
      .post('/api/categories')
      .set(auth())
      .send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body.errors.name).toBeTruthy();
  });
});
