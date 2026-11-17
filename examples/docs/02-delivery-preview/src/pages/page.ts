import { post, redirect } from 'lithono';
import type { Loader } from 'lithono';
import { deliverySchema } from '@/lib/delivery.ts';

export function loader({ url }: Loader) {
  const preview = deliverySchema.safeParse({ quantity: url.searchParams.get('quantity') });
  return { quantity: preview.success ? preview.data.quantity : null };
}

export const actions = {
  preview: post(deliverySchema, ({ input }) => {
    redirect(`/?quantity=${input.quantity}`);
  }),
};

export const meta = () => ({ title: 'Chapter House · Delivery preview checkpoint' });
