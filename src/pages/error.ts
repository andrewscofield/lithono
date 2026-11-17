import type { Loader } from 'lithono';

export function loader({ error }: Loader) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return { message };
}

export const meta = () => ({ title: 'Error · Lithono' });
