import { defineQuery, query } from 'lithono/url';

export const demoQuery = defineQuery({ page: query.integer({ default: 1, min: 1 }) });
export interface DemoData { count: number; page: number }
