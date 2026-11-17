import { existsSync } from 'node:fs';

// Node's loader preserves explicit process environment (including test isolation).
// This server-only import runs before database/auth/provider configuration.
if (existsSync('.env')) process.loadEnvFile('.env');
