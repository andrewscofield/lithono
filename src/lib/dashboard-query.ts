import { defineQuery, query } from 'lithono/url';

export const dashboardQuery = defineQuery({
  project: query.string({ validate: value => value.length <= 150, description: 'Project slug filter' }),
  range: query.enum(['7', '30'], { default: '7', description: 'Reporting window in days' }),
}, { description: 'Filter analytics dashboard metrics by project and time range' });
export function dashboardHref(url: string | URL, project: string) {
  return `/dashboard?${dashboardQuery.write(url, { project })}`;
}
