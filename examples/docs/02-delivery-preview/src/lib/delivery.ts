import { z } from 'zod';

export const deliverySchema = z.object({
  quantity: z.coerce.number().int().min(1).max(10000),
});
