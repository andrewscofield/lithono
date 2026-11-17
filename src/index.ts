import { createLithonoApp } from 'lithono/server';
import { authPlugin } from 'lithono/auth';
import { db, sqlite } from './server/db.ts';
import { auth } from './server/auth.ts';
import { workshopPaymentsPlugin } from './server/integrations/payments.ts';
import { documentationPlugin } from './server/documentation.ts';

export default createLithonoApp({
  plugins: [documentationPlugin, authPlugin({ auth, migrate: true }), workshopPaymentsPlugin(sqlite)],
  locals: () => ({ db }),
  auth: {
    publicUser: ({ user }) => user ? { id: user.id, email: user.email, name: user.name } : null,
  },
});
