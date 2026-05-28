import envPaths from 'env-paths';
import path from 'node:path';

const paths = envPaths('lavande', { suffix: '' });

export const configDir = paths.config;
export const dataDir = paths.data;
export const cacheDir = paths.cache;
export const logDir = paths.log;

export const configFile = path.join(configDir, 'config.json');
export const memoryFile = path.join(dataDir, 'memory.json');
export const debugLogFile = path.join(logDir, 'lavande.log');
