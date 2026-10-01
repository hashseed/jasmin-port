import { NativeFileAccess, NativePickers, withExtension } from './file-access';

type Handle = Awaited<ReturnType<NativePickers['showSaveFilePicker']>>;

/** A fake File System Access API handle that records writes and permission requests. */
function fakeHandle(name: string, content = '', permission: PermissionState = 'granted') {
  const log: string[] = [];
  const handle: Handle & { content: string } = {
    name,
    content,
    getFile: async () => new File([handle.content], name),
    createWritable: async () => {
      let buffer = '';
      return {
        write: async (data: string) => {
          buffer += data;
        },
        close: async () => {
          handle.content = buffer;
          log.push('close');
        },
      };
    },
    queryPermission: async () => permission,
    requestPermission: async () => {
      log.push('request');
      return permission === 'prompt' ? 'granted' : permission;
    },
  };
  return { handle, log };
}

const abort = () => new DOMException('The user aborted a request.', 'AbortError');

describe('NativeFileAccess (File System Access API)', () => {
  it('appends the extension case-insensitively (09 §4.1)', () => {
    expect(withExtension('a', 'asm')).toBe('a.asm');
    expect(withExtension('a.ASM', 'asm')).toBe('a.ASM');
    expect(withExtension('a.asm', 'mem')).toBe('a.asm.mem');
  });

  it('opens with the .asm filter, the remembered directory and returns the handle', async () => {
    const { handle } = fakeHandle('prog.asm', 'nop');
    let options: unknown;
    const access = new NativeFileAccess({
      showOpenFilePicker: async (o) => {
        options = o;
        return [handle];
      },
      showSaveFilePicker: async () => handle,
    });
    const near = { name: 'old.asm' };
    const file = await access.open('asm', near);
    expect(file).toEqual({ name: 'prog.asm', text: 'nop', handle });
    expect(options).toEqual({
      id: 'jasmin-asm',
      startIn: near,
      types: [{ description: 'Assembler Code (*.asm)', accept: { 'text/plain': ['.asm'] } }],
    });
  });

  it('cancelled pickers resolve null; other errors reject', async () => {
    const access = new NativeFileAccess({
      showOpenFilePicker: async () => Promise.reject(abort()),
      showSaveFilePicker: async () => Promise.reject(new TypeError('broken')),
    });
    expect(await access.open('mem', null)).toBeNull();
    await expect(access.saveAs('mem', 'x', '', null)).rejects.toThrow('broken');
  });

  it('save as suggests the name with extension and writes the text', async () => {
    const { handle } = fakeHandle('state.mem');
    let suggested: string | undefined;
    const access = new NativeFileAccess({
      showOpenFilePicker: async () => [],
      showSaveFilePicker: async (o) => {
        suggested = o?.suggestedName;
        return handle;
      },
    });
    const saved = await access.saveAs('mem', 'state', '{}', null);
    expect(suggested).toBe('state.mem');
    expect(saved).toEqual({ name: 'state.mem', handle });
    expect(handle.content).toBe('{}');
  });

  it('write asks for write permission first when it is not granted', async () => {
    const { handle, log } = fakeHandle('prog.asm', 'old', 'prompt');
    const access = new NativeFileAccess({
      showOpenFilePicker: async () => [],
      showSaveFilePicker: async () => handle,
    });
    await access.write(handle, 'new');
    expect(log).toEqual(['request', 'close']);
    expect(handle.content).toBe('new');

    const denied = fakeHandle('ro.asm', 'old', 'denied');
    await expect(access.write(denied.handle, 'new')).rejects.toThrow('not allowed');
    expect(denied.handle.content).toBe('old');
  });
});
