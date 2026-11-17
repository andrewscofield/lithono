import type { Loader } from 'lithono';

export async function loader({ user }: Loader) {
  return {
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
  };
}
