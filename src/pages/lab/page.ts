import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { z } from 'zod';
import { labQuery } from '@/lib/lab-query.ts';
export const hydrate = true;
export function loader(ctx: Loader) { return { sample: labQuery.read(ctx.url.searchParams).sample, message: (ctx.url.searchParams.get('message') ?? '').slice(0, 100) }; }
export const actions = { echo: post(z.object({ message: z.string().trim().min(3, 'Write at least three characters').max(100) }), ctx => { redirect(`/lab?message=${encodeURIComponent(ctx.input.message)}`); }) };
