import { createLithonoApp } from 'lithono/server';
import { authPlugin } from 'lithono/auth';
import { auth } from '@/server/auth.ts';

export default createLithonoApp({
  plugins: [authPlugin({ auth, migrate: true })],
  auth: {
    publicUser: ({ user }) => user ? { id: user.id, email: user.email, name: user.name } : null,
  },
});
