#!/usr/bin/env node
import('../dist/index.js').catch((err) => {
  console.error('\n  Lavande failed to start:\n');
  console.error(err);
  process.exit(1);
});
