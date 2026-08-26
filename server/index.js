import app from './app.js';

const PORT = process.env.PORT || 8787;

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`开饭后厨已就绪 http://127.0.0.1:${PORT}`);
  console.log(`存储: ${process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ? 'Redis' : '本地文件 data/db.json'}`);
});

server.on('error', (err) => {
  console.error('[server error]', err);
  process.exit(1);
});
