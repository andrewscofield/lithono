import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { requireUser } from 'lithono/auth';
import { listingSchema } from '../../../lib/schemas/auth.ts';

export const meta = () => ({ title: 'New listing · Lithono' });

export function loader(ctx: Loader) {
  requireUser(ctx);
  return {};
}

export const actions = {
  createListing: post(listingSchema, async (ctx) => {
    requireUser(ctx);
    const listing = ctx.db.createListing(ctx.input);
    redirect(`/listings/${listing.id}`);
  }),
};

export type PageActions = typeof actions;
