import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const signUpSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
});

export const listingKind = z.enum(['house', 'apartment', 'land']);
export const listingStatus = z.enum(['for-sale', 'pending', 'sold']);

export function labelFor(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const listingSchema = z.object({
  address: z.string().min(5).max(160),
  price: z.coerce.number().min(10000),
  kind: listingKind,
  status: listingStatus,
  featured: z.preprocess(
    (value) => value === true || value === 'on' || value === 'true',
    z.boolean()
  ),
});

export const updatePriceSchema = z.object({
  price: z.coerce.number().min(10000),
  reason: z.string().optional(),
});
