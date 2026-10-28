import { buildServer } from './server.js';
import { config } from './config/index.js';

async function start() {
  const server = await buildServer();

  try {
    await server.listen({
      port: config.port,
      host: config.host
    });
    console.log(`⚡ Snapora backend listening at http://${config.host}:${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
