import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { CONSOLE_MODE_LABELS, ConsoleMode } from '../../devices';
import { DocumentStore } from '../../services/document-store';
import { DeviceDialogs, DeviceMenu, DeviceMenuItem, repaintOnChange } from './device-support';

const MODES = Object.keys(CONSOLE_MODE_LABELS) as ConsoleMode[];

/**
 * The Console tab (spec 06 §3): a read-only monospaced text area, green on dark
 * green. The text is updated at most once per animation frame and kept scrolled
 * to the end, where the original's caret was.
 */
@Component({
  selector: 'app-console-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeviceMenu, CdkContextMenuTrigger],
  template: `
    <textarea
      #output
      class="output"
      readonly
      spellcheck="false"
      aria-label="Console output"
      [cdkContextMenuTriggerFor]="menu"
    ></textarea>
    <ng-template #menu><app-device-menu label="Console" [items]="menuItems" /></ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .output {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 5px;
      border: 0;
      border-radius: 0;
      outline: none;
      resize: none;
      background: rgb(30 46 28);
      color: rgb(0 255 0);
      font-family: var(--font-mono);
      /* 15 pt */
      font-size: 20px;
      line-height: 1.25;
      white-space: pre;
      tab-size: 8;
    }
    .output:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  `,
})
export class ConsoleView {
  readonly doc = input.required<DocumentStore>();
  private readonly output = viewChild.required<ElementRef<HTMLTextAreaElement>>('output');
  private readonly dialogs = inject(DeviceDialogs);
  private frame: number | null = null;
  private ready = false;

  protected readonly menuItems: readonly DeviceMenuItem[] = [
    { label: 'Change Address', run: () => void this.changeAddress() },
    { label: 'Change Mode', run: () => void this.changeMode() },
    {
      label: 'Clear',
      run: () => this.clear(),
      disabled: () => this.device.mode !== 'pipe',
    },
  ];

  constructor() {
    afterNextRender(() => {
      this.ready = true;
      this.update();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.ready = false;
    });
    repaintOnChange(this.doc, 'Console', () => this.invalidate());
  }

  private get device() {
    return this.doc().devices.console;
  }

  private invalidate(): void {
    if (!this.ready || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  private update(): void {
    const output = this.output().nativeElement;
    const text = this.device.text;
    if (output.value === text) return;
    output.value = text;
    output.scrollTop = output.scrollHeight;
  }

  private clear(): void {
    this.device.clear();
    this.update();
  }

  private async changeAddress(): Promise<void> {
    const doc = this.doc();
    const address = await this.dialogs.address(doc, this.device.address, 'console');
    if (address !== null) this.device.setAddress(address, doc.devices.read);
    this.update();
  }

  private async changeMode(): Promise<void> {
    const doc = this.doc();
    const mode = await this.dialogs.choose(
      'Choose the input mode',
      MODES,
      (m) => CONSOLE_MODE_LABELS[m],
    );
    if (mode !== null) this.device.setMode(mode, doc.devices.read);
    this.update();
  }
}
