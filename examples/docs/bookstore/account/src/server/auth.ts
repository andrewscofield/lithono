import { betterAuth } from 'better-auth';
import { database } from '@/server/services.ts';

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error('Export BETTER_AUTH_SECRET before starting Chapter House. See .env.example.');
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173';

export const auth = betterAuth({
  database,
  secret,
  baseURL,
  trustedOrigins: [new URL(baseURL).origin],
  emailAndPassword: { enabled: true },
});
