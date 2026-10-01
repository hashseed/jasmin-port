import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** The two file families of spec 02 §13. */
export type FileKind = 'asm' | 'mem';

/** The dialog filter of each kind (spec 02 §13). */
export const FILE_TYPES: Readonly<
  Record<FileKind, { description: string; extension: string; id: string }>
> = {
  asm: { description: 'Assembler Code (*.asm)', extension: '.asm', id: 'jasmin-asm' },
  mem: { description: 'Memory and Register data (*.mem)', extension: '.mem', id: 'jasmin-mem' },
};

/**
 * A file the app may write back to: a File System Access API handle, opaque to
 * everything but the {@link FileAccess} that produced it.
 */
export interface FileHandle {
  readonly name: string;
}

/** A file the user picked to read. `handle` is null on the `<input type=file>` path. */
export interface OpenedFile {
  readonly name: string;
  readonly text: string;
  readonly handle: FileHandle | null;
}

/** Where a save went. `handle` is null when the file was downloaded. */
export interface SavedFile {
  readonly name: string;
  readonly handle: FileHandle | null;
}

/**
 * The browser's file operations. Pickers resolve null when the user cancels;
 * real I/O failures reject (the caller shows the error text, spec 02 §13).
 */
export interface FileAccess {
  /** Whether saves can write back to a handle (File System Access API). */
  readonly canWriteBack: boolean;
  /** Shows the open dialog. `near` is a handle whose directory the dialog starts in. */
  open(kind: FileKind, near: FileHandle | null): Promise<OpenedFile | null>;
  /** Shows the save dialog (or downloads `suggestedName` on the fallback path). */
  saveAs(
    kind: FileKind,
    suggestedName: string,
    text: string,
    near: FileHandle | null,
  ): Promise<SavedFile | null>;
  /** Overwrites a file previously returned by {@link open} or {@link saveAs}. */
  write(handle: FileHandle, text: string): Promise<void>;
}

/** Appends the kind's extension unless the name already ends with it (case-insensitive). */
export function withExtension(name: string, kind: FileKind): string {
  const ext = FILE_TYPES[kind].extension;
  return name.toLowerCase().endsWith(ext) ? name : name + ext;
}

// ---- File System Access API (Chromium) ----

interface NativeWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface NativeFileHandle extends FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<NativeWritable>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface PickerOptions {
  id?: string;
  startIn?: FileHandle;
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

/** The picker functions of the File System Access API, when the window has them. */
export interface NativePickers {
  showOpenFilePicker(options?: PickerOptions): Promise<NativeFileHandle[]>;
  showSaveFilePicker(options?: PickerOptions): Promise<NativeFileHandle>;
}

function pickerOptions(kind: FileKind, near: FileHandle | null): PickerOptions {
  const type = FILE_TYPES[kind];
  return {
    id: type.id,
    ...(near ? { startIn: near } : {}),
    types: [{ description: type.description, accept: { 'text/plain': [type.extension] } }],
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** {@link FileAccess} over `showOpenFilePicker` / `showSaveFilePicker` with real handles. */
export class NativeFileAccess implements FileAccess {
  readonly canWriteBack = true;

  constructor(private readonly pickers: NativePickers) {}

  async open(kind: FileKind, near: FileHandle | null): Promise<OpenedFile | null> {
    let handles: NativeFileHandle[];
    try {
      handles = await this.pickers.showOpenFilePicker(pickerOptions(kind, near));
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
    const handle = handles[0];
    if (!handle) return null;
    const file = await handle.getFile();
    return { name: file.name, text: await file.text(), handle };
  }

  async saveAs(
    kind: FileKind,
    suggestedName: string,
    text: string,
    near: FileHandle | null,
  ): Promise<SavedFile | null> {
    let handle: NativeFileHandle;
    try {
      handle = await this.pickers.showSaveFilePicker({
        ...pickerOptions(kind, near),
        suggestedName: withExtension(suggestedName, kind),
      });
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
    await this.write(handle, text);
    return { name: handle.name, handle };
  }

  async write(handle: FileHandle, text: string): Promise<void> {
    const native = handle as NativeFileHandle;
    // A handle from the open dialog is read-only until the user grants write access.
    if (native.queryPermission && native.requestPermission) {
      const mode = { mode: 'readwrite' } as const;
      if ((await native.queryPermission(mode)) !== 'granted') {
        if ((await native.requestPermission(mode)) !== 'granted') {
          throw new DOMException(`Writing ${handle.name} was not allowed.`, 'NotAllowedError');
        }
      }
    }
    const writable = await native.createWritable();
    await writable.write(text);
    await writable.close();
  }
}

// ---- Fallback: <input type=file> and downloads ----

/** {@link FileAccess} for browsers without the File System Access API. */
export class FallbackFileAccess implements FileAccess {
  readonly canWriteBack = false;

  constructor(private readonly doc: Document) {}

  async open(kind: FileKind): Promise<OpenedFile | null> {
    const file = await this.pick(FILE_TYPES[kind].extension);
    return file ? { name: file.name, text: await file.text(), handle: null } : null;
  }

  async saveAs(kind: FileKind, suggestedName: string, text: string): Promise<SavedFile> {
    const name = withExtension(suggestedName, kind);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = this.doc.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { name, handle: null };
  }

  write(handle: FileHandle): Promise<void> {
    return Promise.reject(new Error(`Cannot write back to ${handle.name}.`));
  }

  private pick(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = this.doc.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }
}

/** The File System Access API when the browser has it, otherwise the fallback. */
export const FILE_ACCESS = new InjectionToken<FileAccess>('FILE_ACCESS', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    const win = doc.defaultView as (Window & Partial<NativePickers>) | null;
    return win &&
      typeof win.showOpenFilePicker === 'function' &&
      typeof win.showSaveFilePicker === 'function'
      ? new NativeFileAccess(win as unknown as NativePickers)
      : new FallbackFileAccess(doc);
  },
});
