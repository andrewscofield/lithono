import { z } from 'zod';

export const productSchema = z.object({
  title: z.string().trim().min(1).max(160),
  author: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(40),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens'),
  description: z.string().trim().min(10).max(3000),
  priceCents: z.coerce.number().int().min(0).max(1000000),
});
export const versionSchema = z.coerce.number().int().positive();
