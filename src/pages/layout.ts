export async function loader({ user }: import('lithono').Loader) {
  return {
    user: user ? { id: user.id, email: user.email, name: user.name } : null,
  };
}
