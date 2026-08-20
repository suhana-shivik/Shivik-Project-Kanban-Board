import { request as httpRequest } from 'http';
import { URL } from 'url';

/**
 * Runs before Jest collects any tests, which is the only place this check can
 * live: `it` / `it.skip` is decided while the describe body executes, and that
 * happens *before* beforeAll. A flag set in a hook is always too late.
 */
export default async function globalSetup(): Promise<void> {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const reachable = await ping(`${baseUrl}/api/health/live`);

  process.env.E2E_AVAILABLE = reachable ? 'true' : 'false';

  if (!reachable) {
    console.warn(
      `\n  e2e: nothing answering at ${baseUrl} — those suites will be skipped.` +
        '\n  Start the API first:  npm run start\n',
    );
  }
}

function ping(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const target = new URL(url);

    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'GET',
        timeout: 3000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
