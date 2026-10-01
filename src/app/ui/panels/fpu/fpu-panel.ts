import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DocumentStore } from '../../../services/document-store';
import { EditCell } from '../edit-cell';

/** One row of the FPU table: physical register `R_index`. */
export interface FpuRow {
  readonly index: number;
  readonly name: string;
  readonly value: string;
  readonly top: boolean;
}

/**
 * The FPU table (spec 02 §9): eight rows `R0..R7` named `ST<k>` relative to TOP,
 * the `ST0` row bold, values in Java `Double.toString` format and editable.
 */
@Component({
  selector: 'app-fpu-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EditCell],
  template: `
    <table>
      <thead>
        <tr>
          <th scope="col">name</th>
          <th scope="col">value</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.index) {
          <tr [class.top]="row.top" [attr.data-row]="row.index">
            <th scope="row">{{ row.name }}</th>
            <td>
              <input
                class="field"
                [attr.aria-label]="row.name + ' value'"
                [appEditCell]="row.value"
                (commit)="edit(row.index, $event)"
              />
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: var(--font-size-mono);
      font-variant-numeric: tabular-nums;
    }
    thead th {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 0 var(--space-2) 2px;
      background: var(--bg-panel);
      color: var(--text-muted);
      font-family: var(--font-ui);
      font-size: 11px;
      font-weight: 500;
      text-align: left;
    }
    thead th:first-child {
      width: 56px;
    }
    tbody th {
      padding: 0 var(--space-2);
      font-weight: 400;
      text-align: left;
    }
    td {
      padding: 0;
    }
    tr.top,
    tr.top .field {
      font-weight: 700;
    }
    .field {
      width: 100%;
      height: 20px;
      padding: 0 var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text);
      font: inherit;
    }
    .field:hover {
      background: var(--bg-subtle);
    }
    .field:focus {
      outline: none;
      border-color: var(--focus-ring);
      background: var(--bg-panel);
    }
  `,
})
export class FpuPanel {
  readonly doc = input.required<DocumentStore>();

  protected readonly rows = computed<FpuRow[]>(() => {
    const doc = this.doc();
    doc.version();
    const fpu = doc.session.dsp.fpu;
    return Array.from({ length: 8 }, (_, index) => {
      const name = fpu.getRegisterName(index);
      return { index, name, value: fpu.getRegisterContent(index), top: name === 'ST0' };
    });
  });

  protected edit(index: number, text: string): void {
    const doc = this.doc();
    if (doc.session.dsp.fpu.putRegisterContent(index, text)) doc.refreshPanels();
  }
}
