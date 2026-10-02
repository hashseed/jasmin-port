import { Injectable, inject } from '@angular/core';
import { NOT_A_MEMORY_FILE } from '../core';
import { Sample } from '../samples';
import { DialogService } from '../ui/dialogs/dialogs';
import { DocumentStore } from './document-store';
import { FILE_ACCESS, FileHandle, withExtension } from './file-access';
import { SettingsService } from './settings.service';
import { WorkspaceService } from './workspace.service';

/** Normalizes `\r\n` and `\r` to `\n` (spec 09 §4.1). */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * The File menu's file actions (spec 02 §2, §13; 09 §2, §4) over {@link FILE_ACCESS}:
 * the File System Access API with per-document handles where the browser has it,
 * otherwise `<input type=file>` and downloads. Failures show the error text in a
 * modal message (spec 02 §13).
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly workspace = inject(WorkspaceService);
  private readonly settings = inject(SettingsService);
  private readonly access = inject(FILE_ACCESS);
  private readonly dialogs = inject(DialogService);

  /** Opens a sample program from `samples/` (Welcome page) in a new document tab. */
  async openSample(sample: Sample): Promise<DocumentStore | null> {
    return this.guard(async () => {
      const response = await fetch(`samples/${sample.file}`);
      if (!response.ok) throw new Error(`Could not load ${sample.file} (${response.status})`);
      const text = normalizeLineEndings(await response.text());
      const doc = this.workspace.newDocument(sample.file, text);
      doc.markSaved();
      return doc;
    });
  }

  /** File > Open Code: opens the file in a new document tab named after it. */
  async openCode(): Promise<DocumentStore | null> {
    return this.guard(async () => {
      const near = this.workspace.document()?.codeHandle ?? null;
      const file = await this.access.open('asm', near);
      if (!file) return null;
      this.settings.set('lastpath.asm', file.name);
      const doc = this.workspace.newDocument(file.name, normalizeLineEndings(file.text));
      doc.codeHandle = file.handle;
      doc.markSaved();
      return doc;
    });
  }

  /**
   * File > Save Code. Writes back to the file the document was opened from or
   * last saved to; without one (a new document, or no File System Access API)
   * it behaves like {@link saveCodeAs}.
   */
  async saveCode(doc: DocumentStore): Promise<boolean> {
    const handle = doc.codeHandle;
    if (!handle || !this.access.canWriteBack) return this.saveCodeAs(doc);
    return this.guard(async () => {
      const text = doc.text();
      await this.access.write(handle, text);
      this.settings.set('lastpath.asm', handle.name);
      doc.markSaved(text);
      return true;
    }, false);
  }

  /** Save Code As (Ctrl+Shift+S): always asks; appends `.asm` if missing (spec 09 §4.1). */
  async saveCodeAs(doc: DocumentStore): Promise<boolean> {
    return this.guard(async () => {
      const text = doc.text();
      const suggested = doc.codeHandle?.name ?? withExtension(doc.title(), 'asm');
      const saved = await this.access.saveAs('asm', suggested, text, doc.codeHandle);
      if (!saved) return false;
      this.settings.set('lastpath.asm', saved.name);
      doc.title.set(saved.name);
      doc.codeHandle = saved.handle;
      doc.markSaved(text);
      return true;
    }, false);
  }

  /** File > Save Memory (spec 09 §4.3): always asks, suggesting the last memory file. */
  async saveMemory(doc: DocumentStore): Promise<boolean> {
    return this.guard(async () => {
      const suggested =
        doc.memoryHandle?.name ??
        this.settings.get('lastpath.mem') ??
        withExtension(doc.title().replace(/\.asm$/i, ''), 'mem');
      const saved = await this.access.saveAs('mem', suggested, doc.saveMemory(), this.near(doc));
      if (!saved) return false;
      this.settings.set('lastpath.mem', saved.name);
      doc.memoryHandle = saved.handle;
      return true;
    }, false);
  }

  /**
   * File > Load Memory into the selected document (spec 09 §4.3). An invalid
   * file shows `Not a Jasmin memory file.` and changes nothing. Without a
   * selected document there is nothing to load into, so it does nothing.
   */
  async loadMemory(doc: DocumentStore | null): Promise<boolean> {
    if (!doc) return false;
    return this.guard(async () => {
      const file = await this.access.open('mem', this.near(doc));
      if (!file) return false;
      this.settings.set('lastpath.mem', file.name);
      if (!doc.loadMemory(file.text)) {
        await this.dialogs.message(NOT_A_MEMORY_FILE);
        return false;
      }
      doc.memoryHandle = file.handle;
      return true;
    }, false);
  }

  /** The handle whose directory a memory dialog starts in. */
  private near(doc: DocumentStore): FileHandle | null {
    return doc.memoryHandle ?? doc.codeHandle;
  }

  /** Runs a file action; an I/O error shows its text in a modal message. */
  private async guard<T>(action: () => Promise<T>, onError: T): Promise<T>;
  private async guard<T>(action: () => Promise<T | null>): Promise<T | null>;
  private async guard<T>(action: () => Promise<T>, onError: T | null = null): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      await this.dialogs.message(String(error));
      return onError;
    }
  }
}
