// Native Vercel WebSocket entrypoint. Vercel owns the port and request lifecycle.
// Module state is reused only within this Function instance; no database is used.
import game from '../server.js';

const app = game.createServer({ serverless: true });
export default app.server;
