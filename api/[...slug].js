/*
 * Serverless entry point.
 *
 * A catch-all rather than `api/index.js` on purpose: with a catch-all, the
 * function receives the original request path (`/api/health`), which is what
 * the Express router matches on. Routing every /api/* request to a fixed
 * `index` file instead rewrites the path first, and every route 404s.
 *
 * Nothing here calls listen() — the platform owns the server. The app is
 * module-scoped so a warm instance reuses it and pays the schema check only
 * once per cold start.
 */
import app from '../server/src/app.js';

export default app;

/*
 * A Veo render takes around 50 seconds, and the request that starts it also
 * advances it. Well inside Vercel's 300s ceiling, but far outside the default.
 */
export const config = {
  maxDuration: 300,
};
