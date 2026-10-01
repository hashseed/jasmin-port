import { DOCUMENT, Injectable, inject } from '@angular/core';
import { ActionId, ActionsService } from './actions.service';
import { WorkspaceService } from './workspace.service';

/** One key binding; `code` is `KeyboardEvent.code`, so layouts and Alt+letter work. */
export interface KeyBinding {
  readonly action: ActionId;
  readonly code: string;
  /** Ctrl (or Cmd on macOS). */
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  /**
   * The browser has its own meaning for this key (reload, print, open, ...): always
   * swallow it, even when the action is disabled. Otherwise the key is only taken
   * while a document is selected, so native undo keeps working in other inputs.
   */
  readonly reserved?: boolean;
}

/**
 * Accelerators of spec 02 §2 with the browser-safe substitutes: Alt+N for New
 * (Ctrl+N cannot be intercepted), and Ctrl+Y / Ctrl+Shift+Z as extra Redo keys.
 * Cut, Copy and Paste keep the editor's native keys.
 */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  { action: 'new', code: 'KeyN', alt: true, reserved: true },
  { action: 'open', code: 'KeyO', mod: true, reserved: true },
  { action: 'save', code: 'KeyS', mod: true, reserved: true },
  { action: 'undo', code: 'KeyZ', mod: true },
  { action: 'redo', code: 'KeyR', mod: true, reserved: true },
  { action: 'redo', code: 'KeyY', mod: true },
  { action: 'redo', code: 'KeyZ', mod: true, shift: true },
  { action: 'run', code: 'F5', reserved: true },
  { action: 'pause', code: 'KeyP', mod: true, reserved: true },
  { action: 'step', code: 'F7', reserved: true },
  { action: 'executeLine', code: 'F9', reserved: true },
];

export function matchBinding(event: KeyboardEvent): KeyBinding | null {
  const mod = event.ctrlKey || event.metaKey;
  return (
    KEY_BINDINGS.find(
      (b) =>
        b.code === event.code &&
        !!b.mod === mod &&
        !!b.shift === event.shiftKey &&
        !!b.alt === event.altKey,
    ) ?? null
  );
}

/** Routes global key presses to {@link ActionsService}. */
@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private readonly actions = inject(ActionsService);
  private readonly workspace = inject(WorkspaceService);
  private readonly document = inject(DOCUMENT);
  private installed = false;

  /** Listens on the window in the capture phase, before the editor sees the key. */
  install(): void {
    if (this.installed) return;
    this.installed = true;
    this.document.defaultView?.addEventListener('keydown', (e) => this.onKeyDown(e), true);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const binding = matchBinding(event);
    if (!binding) return;
    if (!binding.reserved && this.workspace.document() === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.actions.execute(binding.action);
  }
}
