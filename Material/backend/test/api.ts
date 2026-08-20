import request from 'supertest';

/**
 * The e2e suites drive a **running server over HTTP** rather than booting the
 * app inside Jest.
 *
 * Two reasons. It tests the process that actually ships — global pipes,
 * filters, guards and all — instead of a hand-assembled copy. And Kysely is
 * ESM-only, which Jest's CommonJS runtime cannot import, so pulling AppModule
 * into the test would need a transform pipeline that proves nothing about the
 * app.
 *
 *   npm run start          # in one terminal
 *   npm run test:e2e       # in another
 *
 * Set E2E_BASE_URL to point at something other than localhost:3000.
 */
export const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export const api = () => request(baseUrl);

export async function loginAsAdmin(): Promise<string> {
  const response = await api()
    .post('/api/auth/login')
    .send({ email: 'suhana@gmail.com', password: '123456' });

  return (response.body as { accessToken?: string }).accessToken ?? '';
}

/** Prints the reason once, so a skipped run does not look like a silent pass. */
export function explainSkip(): void {
  console.warn(
    `\n  e2e skipped — nothing answering at ${baseUrl}.` +
      '\n  Start the API first:  npm run start\n',
  );
}
