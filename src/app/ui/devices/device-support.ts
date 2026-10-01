import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  Signal,
  effect,
  inject,
  input,
} from '@angular/core';
import {
  ADDRESS_PROMPT,
  ColorChoice,
  DeviceKind,
  INVALID_VALUE_MESSAGE,
  formatDeviceAddress,
  parseCount,
  parseDeviceAddress,
} from '../../devices';
import { DocumentStore } from '../../services/document-store';
import { DialogService } from '../common/dialogs';

export interface DeviceMenuItem {
  readonly label: string;
  readonly run: () => void;
  readonly disabled?: () => boolean;
}

/** A device's right-click menu (spec 06), styled like the other context menus. */
@Component({
  selector: 'app-device-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenu, CdkMenuItem],
  template: `
    <div cdkMenu class="menu-panel" [attr.aria-label]="label()">
      @for (item of items(); track item.label) {
        <button
          type="button"
          cdkMenuItem
          class="menu-item"
          [cdkMenuItemDisabled]="item.disabled?.() ?? false"
          (cdkMenuItemTriggered)="item.run()"
        >
          <span class="menu-icon"></span>
          <span class="menu-label">{{ item.label }}</span>
          <span></span>
        </button>
      }
    </div>
  `,
})
export class DeviceMenu {
  readonly label = input.required<string>();
  readonly items = input.required<readonly DeviceMenuItem[]>();
}

const COLOR_CHOICES: readonly ColorChoice[] = ['blue', 'jasmin'];

/** The device dialogs with the texts of spec 06. Each resolves to null when cancelled or invalid. */
@Injectable({ providedIn: 'root' })
export class DeviceDialogs {
  private readonly dialogs = inject(DialogService);

  /** Change address: any literal in `[offset, offset + memorySize]`. */
  async address(
    doc: DocumentStore,
    current: number,
    target: keyof typeof ADDRESS_PROMPT = 'display',
  ): Promise<number | null> {
    const text = await this.dialogs.prompt(ADDRESS_PROMPT[target], formatDeviceAddress(current));
    if (text === null) return null;
    const { offset, memorySize } = doc.devices.dataSpace;
    return this.validate(parseDeviceAddress(text, offset, memorySize));
  }

  /** An integer setting (digits, bars, width, height) in `[min, max]`. */
  async count(prompt: string, current: number, min: number, max?: number): Promise<number | null> {
    const text = await this.dialogs.prompt(prompt, String(current));
    if (text === null) return null;
    return this.validate(parseCount(text, min, max));
  }

  /** A choice dialog titled `Please choose`; resolves to the chosen option or null. */
  async choose<T>(
    prompt: string,
    options: readonly T[],
    labels: (option: T) => string,
  ): Promise<T | null> {
    const index = await this.dialogs.choose(prompt, options.map(labels));
    return index === null ? null : options[index];
  }

  /** `Change color`: blue or jasmin. */
  color(): Promise<ColorChoice | null> {
    return this.choose('Choose the color:', COLOR_CHOICES, (color) => color);
  }

  private async validate<T>(value: T | null): Promise<T | null> {
    if (value === null) await this.dialogs.message(INVALID_VALUE_MESSAGE);
    return value;
  }
}

/**
 * Repaints a device view when the document's devices report a write to its bytes
 * or a full refresh; follows the document input. Call in an injection context.
 */
export function repaintOnChange(
  doc: Signal<DocumentStore>,
  device: DeviceKind,
  invalidate: () => void,
): void {
  effect((onCleanup) => {
    const unsubscribe = doc().devices.subscribe((change) => {
      if (change.kind === 'refresh' || change.device === device) invalidate();
    });
    invalidate();
    onCleanup(unsubscribe);
  });
}
