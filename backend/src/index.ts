import { buildServer } from './server.js';
import { config, validateStartupConfig } from './config/index.js';

async function start() {
  const validation = validateStartupConfig();

  for (const warning of validation.warnings) {
    console.warn(`⚠️ [Snapora Config Warning]: ${warning}`);
  }

  for (const error of validation.errors) {
    console.error(`❌ [Snapora Config Error]: ${error}`);
  }

  if (!validation.valid) {
    console.error('Fatal configuration errors encountered. Aborting server launch.');
    process.exit(1);
  }

  const server = await buildServer();

  try {
    await server.listen({
      port: config.port,
      host: config.host
    });
    console.log(`⚡ Snapora backend listening at http://${config.host}:${config.port} (Default Provider: ${config.defaultProvider})`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
