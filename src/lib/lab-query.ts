import { defineQuery, query } from 'lithono/url';
export const labQuery = defineQuery({ sample: query.enum(['first','second'], { default: 'first' }) });
