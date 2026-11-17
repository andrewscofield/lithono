// These examples use only browser HTML APIs, with no library registration.
export function createNative(name: string): HTMLElement {
  const container = document.createElement('div');
  const templates: Record<string, string> = {
    'native-details': '<details><summary>Read the details</summary><p>Native disclosure content.</p></details>',
    'native-form': '<form method="get" action="/components"><label>Search the catalogue <input name="q" value="counter"></label><button>Search examples</button></form>',
    'native-progress': '<label>Example completion <progress max="100" value="60">60%</progress></label>',
    'native-meter': '<label>Example storage <meter min="0" max="100" value="35">35%</meter></label>',
    'native-dialog': '<button type="button">Open dialog</button><dialog><p>A native modal dialog.</p><form method="dialog"><button>Close dialog</button></form></dialog>',
    'native-output': '<label>Quantity <input type="range" min="0" max="10" value="3"></label><output>3</output>',
    'native-validation': '<form><label>Required name <input required name="name"></label><button>Check validity</button><output></output></form>',
  };
  if (!Object.hasOwn(templates, name)) throw new Error('Unknown native example');
  container.innerHTML = templates[name]; // Only fixed, curated literals above.
  container.querySelector('button')?.addEventListener('click', () => container.querySelector('dialog')?.showModal());
  container.querySelector('input[type="range"]')?.addEventListener('input', event => {
    container.querySelector('output')!.value = (event.target as HTMLInputElement).value;
  });
  if (name === 'native-validation') container.querySelector('form')!.onsubmit = event => {
    event.preventDefault();
    container.querySelector('output')!.value = 'Valid name';
  };
  return container;
}
