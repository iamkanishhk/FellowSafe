import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { attachRealtime } from './realtime/io.js';

const httpServer = createServer(createApp());

const io = attachRealtime(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`fellasafe-server listening on :${env.PORT} [${env.NODE_ENV}]`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    io.close();
    httpServer.closeAllConnections();
    void pool.end().finally(() => {
      httpServer.close(() => process.exit(0));
    });
  });
}
