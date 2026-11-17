export function componentQuery(input: string) {
  const params = new URL(input, 'http://localhost').searchParams;
  const choice = (key: string, values: string[]) => values.includes(params.get(key) ?? '') ? params.get(key)! : '';
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    category: choice('category', ['Interaction', 'Content', 'Forms', 'Feedback']),
    rendering: choice('rendering', ['light', 'shadow', 'static']),
    ssr: choice('ssr', ['verified', 'unknown']),
  };
}
