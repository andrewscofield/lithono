import { betterAuth } from 'better-auth';
import { sqlite } from './db.ts';

export const auth = betterAuth({
  database: sqlite,
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET ?? 'lithono-dev-secret-lithono-dev-secret',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  trustedOrigins: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3001',
  ],
});
