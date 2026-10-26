import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigError, loadConfig } from './config.js';
import { createService } from './service.js';

export async function startFromArguments(argv) {
  let config;
  try {
    config = await loadConfig(argv);
  } catch (error) {
    const code = error instanceof ConfigError ? error.code : 'CONFIGURATION_FAILED';
    process.stderr.write('startup blocked: ' + code + '\n');
    process.exitCode = 2;
    return null;
  }

  let service;
  try {
    service = createService(config);
  } catch {
    process.stderr.write('startup blocked: HTTPS_SETUP_FAILED\n');
    process.exitCode = 2;
    return null;
  }
  const { server } = service;
  server.once('error', () => {
    process.stderr.write('startup blocked: LISTEN_FAILED\n');
    process.exitCode = 2;
  });
  server.listen({ host: config.bind, port: config.port, exclusive: true }, () => {
    const address = server.address();
    if (!address || typeof address === 'string' || address.address !== config.bind || address.port !== config.port) {
      server.close(() => {});
      process.stderr.write('startup blocked: BIND_RESULT_MISMATCH\n');
      process.exitCode = 2;
      return;
    }
    process.stdout.write('HTTPS/WSS feasibility probe ready at ' + config.origin + '\n');
  });
  return service;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisPath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(thisPath).href) {
  await startFromArguments(process.argv.slice(2));
}
