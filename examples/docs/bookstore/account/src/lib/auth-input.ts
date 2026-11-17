import { z } from 'zod';

export const signInSchema = z.object({ email: z.email(), password: z.string().min(1) });
export const signUpSchema = signInSchema.extend({ name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128) });

export function localNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/admin';
  const url = new URL(value, 'https://chapter.invalid');
  return url.origin === 'https://chapter.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/admin';
}
