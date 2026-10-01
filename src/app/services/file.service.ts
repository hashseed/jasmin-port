import { Injectable, inject } from '@angular/core';
import { NOT_A_MEMORY_FILE } from '../core';
import { DocumentStore } from './document-store';
import { SettingsService } from './settings.service';
import { WorkspaceService } from './workspace.service';

/**
 * Minimal file actions (spec 02 §13): `<input type=file>` to open and downloads
 * to save. M8 replaces these with the File System Access API and real dialogs.
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly workspace = inject(WorkspaceService);
  private readonly settings = inject(SettingsService);

  /** File > Open Code: opens the file in a new document tab named after it. */
  async openCode(): Promise<void> {
    const file = await pickFile('.asm');
    if (!file) return;
    this.settings.set('lastpath.asm', file.name);
    this.workspace.newDocument(file.name, await file.text());
  }

  /** File > Save Code: always "save as"; appends `.asm` if missing (spec 02 §2). */
  saveCode(doc: DocumentStore): void {
    let name = doc.title();
    if (!name.toLowerCase().endsWith('.asm')) name += '.asm';
    download(name, doc.text());
    this.settings.set('lastpath.asm', name);
    doc.title.set(name);
  }

  /** File > Save Memory (spec 09 §4.3). */
  saveMemory(doc: DocumentStore): void {
    const name = this.settings.get('lastpath.mem') ?? `${doc.title().replace(/\.asm$/i, '')}.mem`;
    download(name, doc.saveMemory());
    this.settings.set('lastpath.mem', name);
  }

  /** File > Load Memory into the selected document. */
  async loadMemory(doc: DocumentStore | null): Promise<void> {
    if (!doc) return;
    const file = await pickFile('.mem');
    if (!file) return;
    this.settings.set('lastpath.mem', file.name);
    if (!doc.loadMemory(await file.text())) globalThis.alert(NOT_A_MEMORY_FILE);
  }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
