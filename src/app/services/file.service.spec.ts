import { TestBed } from '@angular/core/testing';
import { NOT_A_MEMORY_FILE } from '../core';
import { DialogService } from '../ui/dialogs/dialogs';
import {
  FILE_ACCESS,
  FileAccess,
  FileHandle,
  FileKind,
  OpenedFile,
  SavedFile,
  withExtension,
} from './file-access';
import { FileService, normalizeLineEndings } from './file.service';
import { SettingsService } from './settings.service';
import { frozenSessionFactory } from './test-session';
import { SESSION_FACTORY, WorkspaceService } from './workspace.service';

/** An in-memory file system standing in for the browser's pickers. */
class FakeFileAccess implements FileAccess {
  canWriteBack = true;
  readonly files = new Map<string, string>();
  /** What the next open dialog picks (null = cancel). */
  nextOpen: string | null = null;
  /** The name the next save dialog picks (null = cancel); default: the suggestion. */
  nextSaveName: string | null | undefined = undefined;
  failWrites = false;
  readonly calls: string[] = [];

  async open(kind: FileKind, near: FileHandle | null): Promise<OpenedFile | null> {
    this.calls.push(`open ${kind} near=${near?.name ?? '-'}`);
    const name = this.nextOpen;
    if (name === null) return null;
    const text = this.files.get(name) ?? '';
    return { name, text, handle: this.canWriteBack ? { name } : null };
  }

  async saveAs(
    kind: FileKind,
    suggestedName: string,
    text: string,
    near: FileHandle | null,
  ): Promise<SavedFile | null> {
    this.calls.push(`saveAs ${kind} ${suggestedName} near=${near?.name ?? '-'}`);
    const picked = this.nextSaveName === undefined ? suggestedName : this.nextSaveName;
    if (picked === null) return null;
    const name = withExtension(picked, kind);
    await this.store(name, text);
    return { name, handle: this.canWriteBack ? { name } : null };
  }

  async write(handle: FileHandle, text: string): Promise<void> {
    this.calls.push(`write ${handle.name}`);
    await this.store(handle.name, text);
  }

  private async store(name: string, text: string): Promise<void> {
    if (this.failWrites) throw new DOMException('The disk is full.', 'QuotaExceededError');
    this.files.set(name, text);
  }
}

class FakeDialogs {
  readonly messages: string[] = [];
  readonly questions: string[] = [];
  /** The answers the next choice dialogs give, in order (null = Cancel). */
  readonly answers: (number | null)[] = [];
  async message(text: string): Promise<void> {
    this.messages.push(text);
  }
  async choose(text: string): Promise<number | null> {
    this.questions.push(text);
    return this.answers.shift() ?? null;
  }
}

describe('FileService (spec 02 §13, 09 §2, §4)', () => {
  let files: FileService;
  let fs: FakeFileAccess;
  let dialogs: FakeDialogs;
  let workspace: WorkspaceService;
  let settings: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    fs = new FakeFileAccess();
    dialogs = new FakeDialogs();
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_FACTORY, useValue: frozenSessionFactory },
        { provide: FILE_ACCESS, useValue: fs },
        { provide: DialogService, useValue: dialogs },
      ],
    });
    files = TestBed.inject(FileService);
    workspace = TestBed.inject(WorkspaceService);
    settings = TestBed.inject(SettingsService);
  });

  it('normalizes line endings to \\n (09 §4.1)', () => {
    expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('Open Code opens a new unmodified tab named after the file', async () => {
    fs.files.set('prog.asm', 'mov eax, 1\r\nhlt\r\n');
    fs.nextOpen = 'prog.asm';
    workspace.newDocument();
    const doc = await files.openCode();
    expect(workspace.tabs().length).toBe(2);
    expect(workspace.document()).toBe(doc);
    expect(doc?.title()).toBe('prog.asm');
    expect(doc?.text()).toBe('mov eax, 1\nhlt\n');
    expect(doc?.modified()).toBe(false);
    expect(doc?.codeHandle?.name).toBe('prog.asm');
    expect(settings.get('lastpath.asm')).toBe('prog.asm');
  });

  it('Open Code cancelled does nothing', async () => {
    fs.nextOpen = null;
    expect(await files.openCode()).toBeNull();
    expect(workspace.tabs().length).toBe(0);
    expect(dialogs.messages).toEqual([]);
  });

  it('Save Code without a file asks, appends .asm and retitles the tab', async () => {
    const doc = workspace.newDocument();
    doc.setText('nop');
    expect(doc.modified()).toBe(true);
    fs.nextSaveName = 'hello';
    expect(await files.saveCode(doc)).toBe(true);
    expect(fs.calls).toEqual(['saveAs asm new program.asm near=-']);
    expect(fs.files.get('hello.asm')).toBe('nop');
    expect(doc.title()).toBe('hello.asm');
    expect(doc.modified()).toBe(false);
    expect(settings.get('lastpath.asm')).toBe('hello.asm');
  });

  it('Save Code suggests the renamed tab title when there is no file', async () => {
    const doc = workspace.newDocument();
    doc.rename('loop demo');
    fs.nextSaveName = null;
    await files.saveCode(doc);
    expect(fs.calls).toEqual(['saveAs asm loop demo.asm near=-']);
  });

  it('Save Code As keeps suggesting the opened file after a rename', async () => {
    fs.files.set('prog.asm', 'nop');
    fs.nextOpen = 'prog.asm';
    const doc = (await files.openCode())!;
    doc.rename('renamed');
    fs.calls.length = 0;
    fs.nextSaveName = null;
    await files.saveCodeAs(doc);
    expect(fs.calls).toEqual(['saveAs asm prog.asm near=prog.asm']);
  });

  it('Save Code writes back to the remembered file without asking', async () => {
    fs.files.set('prog.asm', 'nop');
    fs.nextOpen = 'prog.asm';
    const doc = (await files.openCode())!;
    doc.setText('hlt');
    expect(doc.modified()).toBe(true);
    fs.calls.length = 0;
    expect(await files.saveCode(doc)).toBe(true);
    expect(fs.calls).toEqual(['write prog.asm']);
    expect(fs.files.get('prog.asm')).toBe('hlt');
    expect(doc.modified()).toBe(false);
  });

  it('Save Code As always asks, starting at the remembered file', async () => {
    fs.files.set('prog.asm', 'nop');
    fs.nextOpen = 'prog.asm';
    const doc = (await files.openCode())!;
    fs.calls.length = 0;
    fs.nextSaveName = 'copy.ASM';
    expect(await files.saveCodeAs(doc)).toBe(true);
    expect(fs.calls).toEqual(['saveAs asm prog.asm near=prog.asm']);
    expect(doc.title()).toBe('copy.ASM');
    expect(doc.codeHandle?.name).toBe('copy.ASM');
  });

  it('Save Code without the File System Access API always downloads', async () => {
    fs.canWriteBack = false;
    const doc = workspace.newDocument('prog.asm', 'nop');
    doc.codeHandle = { name: 'prog.asm' };
    expect(await files.saveCode(doc)).toBe(true);
    expect(fs.calls).toEqual(['saveAs asm prog.asm near=prog.asm']);
    expect(doc.codeHandle).toBeNull();
  });

  it('a cancelled save keeps the document modified', async () => {
    const doc = workspace.newDocument();
    doc.setText('nop');
    fs.nextSaveName = null;
    expect(await files.saveCode(doc)).toBe(false);
    expect(doc.modified()).toBe(true);
    expect(doc.title()).toBe('new program');
  });

  it('an I/O error shows its text in a message and keeps the document modified', async () => {
    fs.files.set('prog.asm', 'nop');
    fs.nextOpen = 'prog.asm';
    const doc = (await files.openCode())!;
    doc.setText('hlt');
    fs.failWrites = true;
    expect(await files.saveCode(doc)).toBe(false);
    expect(dialogs.messages).toEqual(['QuotaExceededError: The disk is full.']);
    expect(doc.modified()).toBe(true);
  });

  it('Save Memory then Load Memory round-trips the machine state', async () => {
    const doc = workspace.newDocument('prog.asm', 'mov eax, 42');
    doc.step();
    expect(doc.session.dsp.registers.get(doc.session.dsp.EAX)).toBe(42);
    expect(await files.saveMemory(doc)).toBe(true);
    expect(fs.calls).toEqual(['saveAs mem prog.mem near=-']);
    expect(settings.get('lastpath.mem')).toBe('prog.mem');
    expect(JSON.parse(fs.files.get('prog.mem')!).format).toBe('jasmin-mem');

    const other = workspace.newDocument();
    fs.nextOpen = 'prog.mem';
    expect(await files.loadMemory(other)).toBe(true);
    expect(other.session.dsp.registers.get(other.session.dsp.EAX)).toBe(42);
    expect(other.memoryHandle?.name).toBe('prog.mem');
    expect(other.text()).toBe('');
  });

  it('Save Memory suggests the last memory file', async () => {
    settings.set('lastpath.mem', 'state.mem');
    const doc = workspace.newDocument();
    await files.saveMemory(doc);
    expect(fs.calls).toEqual(['saveAs mem state.mem near=-']);
    await files.saveMemory(doc);
    expect(fs.calls[1]).toBe('saveAs mem state.mem near=state.mem');
  });

  it('Load Memory of a non-memory file shows "Not a Jasmin memory file." and changes nothing', async () => {
    const doc = workspace.newDocument('prog.asm', 'mov eax, 7');
    doc.step();
    fs.files.set('prog.asm', 'mov eax, 7');
    fs.nextOpen = 'prog.asm';
    expect(await files.loadMemory(doc)).toBe(false);
    expect(dialogs.messages).toEqual([NOT_A_MEMORY_FILE]);
    expect(dialogs.messages[0]).toBe('Not a Jasmin memory file.');
    expect(doc.session.dsp.registers.get(doc.session.dsp.EAX)).toBe(7);
    expect(doc.memoryHandle).toBeNull();
  });

  it('Load Memory without a document does nothing', async () => {
    expect(await files.loadMemory(null)).toBe(false);
    expect(fs.calls).toEqual([]);
  });

  describe('closing a modified document asks to save (02 §1, 07 Q-UI-5)', () => {
    it('closes an unmodified document without asking', async () => {
      const doc = workspace.newDocument('prog.asm', 'nop');
      doc.markSaved();
      expect(await files.closeSelected()).toBe(true);
      expect(workspace.tabs()).toEqual([]);
      expect(dialogs.questions).toEqual([]);
    });

    it('Cancel keeps the tab', async () => {
      workspace.newDocument().setText('nop');
      dialogs.answers.push(null);
      expect(await files.closeSelected()).toBe(false);
      expect(dialogs.questions).toEqual(['Save changes to new program?']);
      expect(workspace.tabs().length).toBe(1);
    });

    it("Don't Save closes without saving", async () => {
      workspace.newDocument().setText('nop');
      dialogs.answers.push(1);
      expect(await files.closeSelected()).toBe(true);
      expect(workspace.tabs()).toEqual([]);
      expect(fs.files.size).toBe(0);
    });

    it('Save saves, then closes; a cancelled save keeps the tab', async () => {
      const doc = workspace.newDocument();
      doc.setText('nop');
      fs.nextSaveName = null;
      dialogs.answers.push(0);
      expect(await files.closeSelected()).toBe(false);
      expect(workspace.tabs().length).toBe(1);

      fs.nextSaveName = undefined;
      dialogs.answers.push(0);
      expect(await files.closeSelected()).toBe(true);
      expect(fs.files.get('new program.asm')).toBe('nop');
      expect(workspace.tabs()).toEqual([]);
    });

    it('Exit asks for each modified document, selecting it, and stops at Cancel', async () => {
      workspace.newDocument('a.asm').setText('nop');
      const b = workspace.newDocument('b.asm');
      b.markSaved();
      const c = workspace.newDocument('c.asm');
      c.setText('hlt');
      workspace.openHelp('welcome');
      dialogs.answers.push(1, null);
      expect(await files.closeAll()).toBe(false);
      expect(dialogs.questions).toEqual(['Save changes to a.asm?', 'Save changes to c.asm?']);
      expect(workspace.document()).toBe(c);
      expect(workspace.tabs().map((t) => t.id)).toEqual([`doc-${c.id}`, workspace.tabs()[1].id]);
    });
  });
});
