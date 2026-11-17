import type { ReactiveController } from 'lit';
import { FormSubmitController } from '../../src/framework/client/form-host.ts';

class Phase4Host extends HTMLElement {
  controllers: ReactiveController[] = [];
  updateComplete = Promise.resolve(true);
  addController(controller: ReactiveController) { this.controllers.push(controller); }
  removeController(controller: ReactiveController) { this.controllers = this.controllers.filter((item) => item !== controller); }
  requestUpdate() {}
  constructor() { super(); new FormSubmitController(this); }
  connectedCallback() {
    this.controllers.forEach((controller) => controller.hostConnected?.());
    this.addEventListener('lithono:success', (event) => {
      document.querySelector('#result')!.textContent = JSON.stringify((event as CustomEvent).detail.result);
    });
  }
  disconnectedCallback() { this.controllers.forEach((controller) => controller.hostDisconnected?.()); }
}

/** Real FACE: validity deliberately lives only in ElementInternals, not a public facade. */
class Phase4Control extends HTMLElement {
  static formAssociated = true;
  internals = this.attachInternals();
  connectedCallback() { this.setValue('custom initial'); }
  setValue(value: string) {
    this.internals.setFormValue(value);
    this.internals.setValidity(value ? {} : { valueMissing: true }, value ? '' : 'Custom value required');
  }
  formResetCallback() { this.setValue('custom initial'); }
}
customElements.define('phase4-control', Phase4Control);
customElements.define('phase4-host', Phase4Host);
