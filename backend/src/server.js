import { loadConfig } from './config.js';
import { buildApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  process.stderr.write(
    `IntentLock backend configuration error: ${error.message}\n`,
  );
  process.exit(1);
}

const app = buildApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { host: config.host, port: config.port, chainId: config.chainId },
    'IntentLock backend listening',
  );
} catch (error) {
  app.log.error({ err: error }, 'Unable to start backend');
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
