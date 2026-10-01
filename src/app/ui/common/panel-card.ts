import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A flat panel card with a small uppercase section header (docs/plan.md,
 * "Surfaces"). The heading names the card's region; with `headerHidden` it is
 * kept for assistive technology only (the original's editor has no title).
 */
@Component({
  selector: 'app-panel-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', '[attr.aria-label]': 'heading()' },
  template: `
    <header class="panel-header" [class.visually-hidden]="headerHidden()">
      <h2>{{ heading() }}</h2>
    </header>
    <div class="panel-body"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      margin: 3px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3) var(--space-1);
    }
    h2 {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .panel-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: var(--panel-pad, var(--space-1) var(--space-3) var(--space-2));
    }
  `,
})
export class PanelCard {
  readonly heading = input.required<string>();
  /** Hides the header visually; the region keeps its accessible name. */
  readonly headerHidden = input(false);
}
