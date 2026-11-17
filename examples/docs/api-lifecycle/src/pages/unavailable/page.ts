import { HttpError } from 'lithono';

export function loader() {
  throw new HttpError(503, 'Deliberate navigation failure');
}
