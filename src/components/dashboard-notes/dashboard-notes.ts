import { property, customElement } from 'lit/decorators.js';
import { LithonoElement } from 'lithono/client';
import type { LithonoFormSuccessDetail } from 'lithono/client';
import type { ActionView } from 'lithono';
import type { Project } from '../../server/repositories/projects.ts';
import './dashboard-notes.css';

@customElement('dashboard-notes')
export class DashboardNotes extends LithonoElement {
  static root = 'light' as const;
  static hydrate = true;
  @property({ attribute: false }) project?: Project;
  private dirty = false;
  private projectId?: string;
  private expectedVersion?: number;
  private formHost?: HTMLElement;
  private get notesValue() {
    if (this.dirty && this.projectId === this.project?.id) return this.querySelector('textarea')?.value ?? this.project?.notes ?? '';
    const action = (this.actions() as ActionView).saveNotes;
    return action.error && action.values?.projectId === this.project?.id ? String(action.values?.notes ?? '') : this.project?.notes ?? '';
  }
  private get formVersion() {
    const action = (this.actions() as ActionView).saveNotes;
    return action.error && action.values?.projectId === this.project?.id
      ? Number(action.values?.version) : this.expectedVersion ?? this.project?.notes_version ?? 1;
  }
  private input = () => {
    this.dirty = true;
    // Input can arrive between connection and the first update. Associate the
    // draft now so first updated() cannot mistake it for a project change.
    this.projectId ??= this.project?.id ?? this.querySelector<HTMLInputElement>('[name=projectId]')?.value;
    this.expectedVersion ??= Number(this.querySelector<HTMLInputElement>('[name=version]')?.value) || this.project?.notes_version;
  };
  private success = (event: Event) => {
    const detail = (event as CustomEvent<LithonoFormSuccessDetail>).detail;
    const result = detail.result as { projectId?: string; version?: number; notes?: string };
    if (detail.action !== 'saveNotes' || result.projectId !== this.project?.id) return;
    // A user can type again while the save request is in flight.
    this.dirty = this.querySelector('textarea')?.value !== result.notes;
    this.expectedVersion = result.version;
    const version = this.querySelector<HTMLInputElement>('[name=version]');
    if (version) version.value = String(result.version);
  };
  override connectedCallback() {
    super.connectedCallback();
    if (typeof window === 'undefined') return;
    this.addEventListener('input', this.input);
    this.formHost = this.closest<HTMLElement>('[data-lithono-page]') ?? undefined;
    this.formHost?.addEventListener('lithono:success', this.success);
  }
  override disconnectedCallback() {
    this.removeEventListener('input', this.input);
    this.formHost?.removeEventListener('lithono:success', this.success);
    this.formHost = undefined;
    super.disconnectedCallback();
  }
  protected override updated() {
    if (this.projectId !== this.project?.id) { this.dirty = false; this.projectId = this.project?.id; }
    // Explicit property assignment only when the component does not own a draft.
    if (!this.dirty && this.project) {
      const textarea = this.querySelector('textarea');
      if (textarea && textarea.value !== this.notesValue) textarea.value = this.notesValue;
      const version = this.querySelector<HTMLInputElement>('[name=version]');
      if (version) version.value = String(this.formVersion);
    }
  }
  protected override willUpdate() {
    if (typeof window !== 'undefined' && !this.hasUpdated && !this.dirty) {
      const textarea = this.querySelector('textarea');
      // Native SSR controls may be edited before registration/listeners. Their
      // dirty value is authoritative until the user explicitly saves or navigates.
      if (textarea && textarea.value !== textarea.defaultValue) {
        this.dirty = true;
        this.projectId = this.project?.id;
        this.expectedVersion = Number(this.querySelector<HTMLInputElement>('[name=version]')?.value) || this.project?.notes_version;
      }
    }
    if (!this.dirty || this.projectId !== this.project?.id) this.expectedVersion = this.project?.notes_version;
  }
}
export default DashboardNotes;
