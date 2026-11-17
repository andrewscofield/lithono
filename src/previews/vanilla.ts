export class DirectoryVanilla extends HTMLElement {
  connectedCallback() {
    if (this.childNodes.length) return;
    const button = document.createElement('button');
    button.type = 'button';
    let count = 0;
    button.textContent = 'Vanilla count: 0';
    button.onclick = () => { button.textContent = `Vanilla count: ${++count}`; };
    this.append(button);
  }
}
if (!customElements.get('directory-vanilla')) customElements.define('directory-vanilla', DirectoryVanilla);
