import { runCli } from './cli.js';
import { formatError } from './utils/errors.js';

runCli(process.argv).catch((err) => {
  process.stderr.write(formatError(err));
  process.exit(1);
});
