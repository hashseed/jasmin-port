import { describe, expect, it } from 'vitest';
import { MachineSession } from '../core';
import { DEVICE_COLORS, LAMP_COLOR, darken } from './color';
import { ConsoleDevice } from './console';
import { DeviceChange, DeviceSet } from './device-set';
import {
  INVALID_VALUE_MESSAGE,
  formatDeviceAddress,
  parseCount,
  parseDeviceAddress,
  parseJavaInt,
} from './dialog-input';
import { polygonContains } from './geometry';
import {
  GraphicsDevice,
  binaryPixelBit,
  graphicsByteCount,
  graphicsLayout,
  hitPixel,
  pixelColor,
  pixelRect,
  renderPixels,
} from './graphics';
import { ByteReader, memoryReader, readBytes, toggleMemoryBit } from './memory-range';
import {
  describeDigits,
  hitSegment,
  segmentLetters,
  segmentLit,
  sevenSegmentLayout,
} from './seven-segment';
import { StripLightDevice, describeLamps, hitLamp, lampLit, stripLightLayout } from './strip-light';

/** A reader over a plain byte list starting at address 0. */
const reader =
  (bytes: readonly number[]): ByteReader =>
  (address) =>
    bytes[address] ?? 0;

function run(session: MachineSession, program: string): void {
  session.setText(program);
  for (
    let i = 0;
    i < 1000 && session.dsp.getInstructionPointer() < session.program.lineCount;
    i++
  ) {
    session.step();
  }
}

describe('colors', () => {
  it('darkens like Java Math.round(channel * float)', () => {
    expect(darken(DEVICE_COLORS.blue, 0.2)).toEqual({ r: 13, g: 29, b: 51 });
    expect(darken(DEVICE_COLORS.blue, 0.1)).toEqual({ r: 6, g: 14, b: 26 });
    expect(darken(DEVICE_COLORS.jasmin, 0.2)).toEqual({ r: 50, g: 26, b: 45 });
    expect(darken(LAMP_COLOR, 0.2)).toEqual({ r: 51, g: 51, b: 0 });
  });
});

describe('7-Segment', () => {
  it('maps bits 0-6 to segments a-g and ignores bit 7', () => {
    expect(segmentLetters(0x3f)).toBe('abcdef');
    expect(segmentLetters(0x06)).toBe('bc');
    expect(segmentLetters(0x5b)).toBe('abdeg');
    expect(segmentLetters(0x07)).toBe('abc');
    expect(segmentLetters(0x80)).toBe('');
    expect(segmentLit(0x40, 6)).toBe(true);
  });

  it('byte 0 drives the rightmost digit: 07 06 3F 5B reads 2017', () => {
    expect(describeDigits([0x07, 0x06, 0x3f, 0x5b])).toBe('abdeg abcdef bc abc');
    expect(describeDigits([0x3f, 0, 0, 0])).toBe('- - - abcdef');
  });

  it('the emcelettronica program leaves 07 06 3F 5B (dword writes clear the next bytes)', () => {
    const session = new MachineSession();
    run(
      session,
      [
        'mov ebx,0',
        'mov [ebx],7',
        'mov ebx,1',
        'mov [ebx],6',
        'mov ebx,2',
        'mov [ebx],63',
        'mov ebx,3',
        'mov [ebx],91',
      ].join('\n'),
    );
    expect(readBytes(memoryReader(session.dsp), 0, 4)).toEqual([0x07, 0x06, 0x3f, 0x5b]);
  });

  it('lays out digits right to left, centered, with pointed segments', () => {
    const layout = sevenSegmentLayout(410 + 0, 190, 4)!;
    expect(layout.segments).toHaveLength(28);
    const rightmostA = layout.segments.find((s) => s.digit === 0 && s.segment === 0)!;
    const leftmostA = layout.segments.find((s) => s.digit === 3 && s.segment === 0)!;
    expect(leftmostA.polygon[0].x).toBeLessThan(rightmostA.polygon[0].x);
    for (const shape of layout.segments) expect(shape.polygon).toHaveLength(6);
    // Centered: equal margins left and right (up to integer rounding).
    const { background } = layout;
    expect(Math.abs(background.x - (410 - background.x - background.width))).toBeLessThanOrEqual(1);
    expect(sevenSegmentLayout(0, 100, 4)).toBeNull();
  });

  it('matches the unscaled geometry at factor 1', () => {
    // 4 digits: 4*50 + 3*8 + 40 = 264 wide, 92 + 40 = 132 high.
    const layout = sevenSegmentLayout(264, 132, 4)!;
    expect(layout.background).toEqual({ x: 0, y: 0, width: 264, height: 132 });
    const a = layout.segments.find((s) => s.digit === 3 && s.segment === 0)!.polygon;
    // Top segment of the leftmost digit: hexagon from (25, 24) to (65, 24), 8 thick.
    expect(a).toEqual([
      { x: 25, y: 24 },
      { x: 29, y: 28 },
      { x: 61, y: 28 },
      { x: 65, y: 24 },
      { x: 61, y: 20 },
      { x: 29, y: 20 },
    ]);
  });

  it('hit-tests segments by polygon', () => {
    const layout = sevenSegmentLayout(264, 132, 4)!;
    expect(hitSegment(layout, 45, 24)).toMatchObject({ digit: 3, segment: 0 });
    // middle segment g of the rightmost digit
    const g = layout.segments.find((s) => s.digit === 0 && s.segment === 6)!;
    const cx = (g.polygon[0].x + g.polygon[3].x) / 2;
    expect(hitSegment(layout, cx, g.polygon[0].y)).toMatchObject({ digit: 0, segment: 6 });
    expect(hitSegment(layout, 1, 1)).toBeNull();
    expect(polygonContains(g.polygon, cx, g.polygon[0].y + 10)).toBe(false);
  });
});

describe('StripLight', () => {
  it('reads ceil(bars/8) bytes little-endian, bit i = lamp i from the right', () => {
    const device = new StripLightDevice(0);
    expect(device.byteCount).toBe(2);
    device.bars = 17;
    expect(device.byteCount).toBe(3);
    expect(device.watches(2)).toBe(true);
    expect(device.watches(3)).toBe(false);
    expect(lampLit([0x01, 0x80], 0)).toBe(true);
    expect(lampLit([0x01, 0x80], 15)).toBe(true);
    expect(lampLit([0x01, 0x80], 14)).toBe(false);
    expect(describeLamps([0x01, 0x80], 16)).toBe('1000000000000001');
    expect(describeLamps([0x05], 4)).toBe('0101');
  });

  it('lays out lamps right to left and hit-tests them', () => {
    // 16 bars at factor 1: 16*7 + 15*14 + 40 = 362 wide, 60 high.
    const layout = stripLightLayout(362, 60, 16)!;
    const lamp0 = layout.lamps[0].rect;
    const lamp15 = layout.lamps[15].rect;
    expect(lamp0.x).toBeGreaterThan(lamp15.x);
    expect(lamp0.width).toBe(7);
    expect(lamp0.height).toBe(20);
    expect(layout.lamps[0].rect.x - layout.lamps[1].rect.x).toBe(12);
    expect(hitLamp(layout, lamp0.x + 1, lamp0.y + 1)?.lamp).toBe(0);
    expect(hitLamp(layout, lamp0.x - 1, lamp0.y + 1)).toBeNull();
  });
});

describe('Graphics', () => {
  it('byte counts per mode', () => {
    expect(graphicsByteCount('binary', 16, 16)).toBe(32);
    expect(graphicsByteCount('binary', 3, 3)).toBe(2);
    expect(graphicsByteCount('8colors', 3, 3)).toBe(5);
    expect(graphicsByteCount('truecolor', 2, 2)).toBe(16);
  });

  it('binary: LSB first, row-major', () => {
    const on = DEVICE_COLORS.blue;
    const off = darken(on, 0.2);
    const read = reader([0b0000_0010, 0, 0b1000_0000]);
    expect(pixelColor(read, 0, 'binary', 16, 1, 0, on)).toEqual(on);
    expect(pixelColor(read, 0, 'binary', 16, 0, 0, on)).toEqual(off);
    // byte 2 bit 7 = pixel index 23 = (7, 1) in a 16-wide picture
    expect(pixelColor(read, 0, 'binary', 16, 7, 1, on)).toEqual(on);
    expect(binaryPixelBit(16, 7, 1)).toEqual({ byte: 2, bit: 7 });
  });

  it('8 colors: low nibble first, bit0 red, bit1 green, bit2 blue, bit3 unused', () => {
    const read = reader([0x9c]); // low nibble 0xC = blue (+unused), high nibble 0x9 = red (+unused)
    const on = DEVICE_COLORS.blue;
    expect(pixelColor(read, 0, '8colors', 4, 0, 0, on)).toEqual({ r: 0, g: 0, b: 255 });
    expect(pixelColor(read, 0, '8colors', 4, 1, 0, on)).toEqual({ r: 255, g: 0, b: 0 });
    expect(pixelColor(reader([0x63]), 0, '8colors', 4, 0, 0, on)).toEqual({ r: 255, g: 255, b: 0 });
    expect(pixelColor(reader([0x63]), 0, '8colors', 4, 1, 0, on)).toEqual({ r: 0, g: 255, b: 255 });
  });

  it('TrueColor: R, G, B, unused per pixel', () => {
    const read = reader([1, 2, 3, 99, 10, 20, 30, 99]);
    const on = DEVICE_COLORS.blue;
    expect(pixelColor(read, 0, 'truecolor', 2, 0, 0, on)).toEqual({ r: 1, g: 2, b: 3 });
    expect(pixelColor(read, 0, 'truecolor', 2, 1, 0, on)).toEqual({ r: 10, g: 20, b: 30 });
    expect(pixelColor(read, 0, 'truecolor', 2, 0, 1, on)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('renders RGBA buffers', () => {
    const device = new GraphicsDevice(0, 'jasmin');
    device.width = 2;
    device.height = 1;
    const data = renderPixels(reader([0b01]), device);
    expect([...data]).toEqual([248, 128, 224, 255, 50, 26, 45, 255]);
  });

  it('lays out squares with a 1 px gap and a one-pixel background border', () => {
    const layout = graphicsLayout(200, 200, 16, 16)!;
    // (200 - 17) / 18 = 10
    expect(layout.pixelSize).toBe(10);
    expect(layout.gap).toBe(1);
    expect(layout.x0).toBe(Math.trunc((200 - 16 * 11) / 2));
    expect(layout.background.x).toBe(layout.x0 - 10);
    expect(pixelRect(layout, 1, 0).x).toBe(layout.x0 + 11);
    expect(graphicsLayout(800, 600, 161, 10)!.gap).toBe(0);
    expect(graphicsLayout(800, 600, 10, 121)!.gap).toBe(0);
  });

  it('hit-tests pixels, excluding gaps', () => {
    const layout = graphicsLayout(200, 200, 16, 16)!;
    const r = pixelRect(layout, 3, 2);
    expect(hitPixel(layout, 16, 16, r.x, r.y)).toEqual({ x: 3, y: 2 });
    expect(hitPixel(layout, 16, 16, r.x + r.width, r.y)).toBeNull();
    expect(hitPixel(layout, 16, 16, layout.x0 - 1, r.y)).toBeNull();
    expect(hitPixel(layout, 16, 16, layout.x0 + 16 * 11, r.y)).toBeNull();
  });
});

describe('Console', () => {
  const bytes = (text: string) => [...text].map((c) => c.charCodeAt(0));

  it('array mode shows the zero-terminated string at the address', () => {
    const console = new ConsoleDevice(0);
    console.refresh(reader([...bytes('Hello'), 0, ...bytes('World')]));
    expect(console.text).toBe('Hello');
    console.setAddress(6, reader([...bytes('Hello'), 0, ...bytes('World')]));
    expect(console.text).toBe('World');
    console.setAddress(0, reader([0xe9, 0xfc]));
    expect(console.text).toBe('éü');
  });

  it('array mode updates live: replace, truncate, extend through following bytes', () => {
    const memory = [...bytes('abc'), 0, 0, ...bytes('xy'), 0];
    const read = reader(memory);
    const console = new ConsoleDevice(0);
    console.refresh(read);
    const write = (address: number, value: number) => {
      memory[address] = value;
      return console.write(address, value, read);
    };
    expect(write(1, 0x42)).toBe(true);
    expect(console.text).toBe('aBc');
    expect(write(4, 0x21)).toBe(false); // beyond the terminator
    expect(console.text).toBe('aBc');
    expect(write(3, 0x2d)).toBe(true); // fills the terminator: continues through "!"
    expect(console.text).toBe('aBc-!xy');
    expect(write(2, 0)).toBe(true);
    expect(console.text).toBe('aB');
    expect(write(2, 0)).toBe(false);
  });

  it('pipe mode types bytes written to the address only', () => {
    const console = new ConsoleDevice(0);
    console.refresh(reader(bytes('old')));
    console.setMode('pipe', reader([]));
    expect(console.text).toBe('');
    for (const c of bytes('Hi')) console.write(0, c, reader([]));
    expect(console.text).toBe('Hi');
    expect(console.write(1, 0x41, reader([]))).toBe(false);
    console.write(0, 10, reader([]));
    console.write(0, 0x41, reader([]));
    expect(console.text).toBe('Hi\nA');
    console.write(0, 8, reader([]));
    console.write(0, 8, reader([]));
    expect(console.text).toBe('Hi');
    expect(console.write(0, 0, reader([]))).toBe(false);
    expect(console.write(0, 13, reader([]))).toBe(false);
    expect(console.write(0, 0x7f, reader([]))).toBe(false);
    console.clear();
    expect(console.text).toBe('');
    expect(console.write(0, 8, reader([]))).toBe(false);
  });

  it('switching back to array mode re-reads; same mode is a no-op', () => {
    const console = new ConsoleDevice(0);
    console.setMode('pipe', reader([]));
    console.write(0, 0x41, reader([]));
    console.setMode('pipe', reader([]));
    expect(console.text).toBe('A');
    console.setMode('array', reader(bytes('xyz')));
    expect(console.text).toBe('xyz');
  });
});

describe('dialog input', () => {
  it('parses addresses in any literal form within [offset, offset + memorySize]', () => {
    expect(parseDeviceAddress('0x10', 0, 4096)).toBe(16);
    expect(parseDeviceAddress('10h', 0, 4096)).toBe(16);
    expect(parseDeviceAddress('1010b', 0, 4096)).toBe(10);
    expect(parseDeviceAddress('4096', 0, 4096)).toBe(4096);
    expect(parseDeviceAddress('4097', 0, 4096)).toBeNull();
    expect(parseDeviceAddress('99', 100, 4096)).toBeNull();
    expect(parseDeviceAddress('junk', 0, 4096)).toBeNull();
    expect(parseDeviceAddress('', 0, 4096)).toBeNull();
    expect(formatDeviceAddress(255)).toBe('0xff');
    expect(INVALID_VALUE_MESSAGE).toBe('The entered value was not valid!');
  });

  it('parses counts like Integer.parseInt with a range', () => {
    expect(parseJavaInt('+7')).toBe(7);
    expect(parseJavaInt('1.5')).toBeNull();
    expect(parseJavaInt('99999999999')).toBeNull();
    expect(parseCount('8', 1, 8)).toBe(8);
    expect(parseCount('9', 1, 8)).toBeNull();
    expect(parseCount('0', 1, 8)).toBeNull();
    expect(parseCount('0x8', 1, 8)).toBeNull();
    expect(parseCount('500', 1)).toBe(500);
  });
});

describe('memory bits', () => {
  it('toggles a bit with a read-modify-write of the watched bytes', () => {
    const session = new MachineSession();
    const { dsp } = session;
    toggleMemoryBit(dsp, 0, 4, 0);
    toggleMemoryBit(dsp, 0, 4, 25);
    expect(readBytes(memoryReader(dsp), 0, 4)).toEqual([0x01, 0, 0, 0x02]);
    toggleMemoryBit(dsp, 0, 4, 0);
    expect(dsp.memory.get(0)).toBe(0);
    // A range reaching past the end of memory writes only the bit's byte.
    const end = dsp.offset + dsp.memorySize;
    expect(toggleMemoryBit(dsp, end - 1, 4, 3)).toBe(true);
    expect(dsp.memory.get(end - 1)).toBe(8);
    expect(toggleMemoryBit(dsp, end - 1, 4, 8)).toBe(false);
    expect(dsp.addressOutOfRange()).toBe(false);
  });

  it('reads 0 outside memory without raising the out-of-range flag', () => {
    const session = new MachineSession();
    const read = memoryReader(session.dsp);
    expect(read(-1)).toBe(0);
    expect(read(session.dsp.memorySize)).toBe(0);
    expect(session.dsp.addressOutOfRange()).toBe(false);
  });
});

describe('DeviceSet', () => {
  function setup() {
    const session = new MachineSession();
    const devices = new DeviceSet(session, () => 0.1);
    const changes: DeviceChange[] = [];
    devices.subscribe((change) => changes.push(change));
    return { session, devices, changes };
  }

  it('starts at the start of memory with defaults and a random color', () => {
    const { devices } = setup();
    expect(devices.sevenSegment.address).toBe(0);
    expect(devices.sevenSegment.digits).toBe(4);
    expect(devices.sevenSegment.color).toBe('blue');
    expect(devices.stripLight.bars).toBe(16);
    expect(devices.console.mode).toBe('array');
    expect(devices.graphics).toMatchObject({ width: 16, height: 16, mode: 'binary' });
    expect(new DeviceSet(new MachineSession(), () => 0.9).graphics.color).toBe('jasmin');
  });

  it('reports writes to watched bytes', () => {
    const { session, devices, changes } = setup();
    devices.graphics.address = 100;
    session.setText('mov byte [0], 0x3F\nmov byte [100], 1');
    session.step();
    const writes = changes
      .filter((c) => c.kind === 'write')
      .map((c) => c.kind === 'write' && c.device);
    expect(writes).toEqual(['7-Segment', 'StripLight', 'Console']);
    expect(changes.at(-1)).toEqual({ kind: 'refresh' });
    changes.length = 0;
    session.step();
    expect(changes[0]).toEqual({ kind: 'write', device: 'Graphics' });
  });

  it('the pipe console prints a program string; Reset clears it', () => {
    const { session, devices } = setup();
    devices.console.setMode('pipe', devices.read);
    run(session, "mov al, 'H'\nmov [0], al\nmov al, 'i'\nmov [0], al");
    expect(devices.console.text).toBe('Hi');
    session.reset();
    expect(devices.console.text).toBe('');
  });

  it('the array console follows memory and refreshes after Load Snapshot', () => {
    const { session, devices } = setup();
    run(session, "mov byte [0], 'O'\nmov byte [1], 'K'");
    expect(devices.console.text).toBe('OK');
    session.takeSnapshot();
    session.reset();
    expect(devices.console.text).toBe('');
    session.loadSnapshot();
    expect(devices.console.text).toBe('OK');
  });

  it('follows a replaced machine after Load Memory', () => {
    const { session, devices, changes } = setup();
    devices.stripLight.address = 4000;
    const other = new MachineSession({ memorySize: 64, offset: 1024 });
    other.dsp.memory.set(1024, 0x41);
    expect(session.loadMemory(other.saveMemory())).toBe(true);
    expect(devices.dataSpace).toBe(session.dsp);
    expect(devices.stripLight.address).toBe(1024);
    expect(devices.console.address).toBe(1024);
    expect(devices.console.text).toBe('A');
    changes.length = 0;
    session.dsp.memory.set(1024, 0x42);
    expect(changes).toContainEqual({ kind: 'write', device: 'StripLight' });
    expect(devices.console.text).toBe('B');
    devices.dispose();
    changes.length = 0;
    session.dsp.memory.set(1024, 0x43);
    expect(changes).toEqual([]);
  });
});

describe('DeviceSet watched ranges', () => {
  function setup() {
    const session = new MachineSession({ memorySize: 4096, offset: 0 });
    const devices = new DeviceSet(session, () => 0.1);
    const changes: string[] = [];
    devices.subscribe((change) =>
      changes.push(change.kind === 'write' ? change.device : change.kind),
    );
    return { session, devices, changes, memory: session.dsp.memory };
  }

  it('watches only the bytes of the devices', () => {
    const { devices, memory, changes } = setup();
    devices.sevenSegment.address = 100;
    devices.stripLight.address = 200;
    devices.graphics.address = 300;
    devices.console.setAddress(400, devices.read);
    expect(memory.isWatched(99, 1)).toBe(false);
    expect(memory.isWatched(100, 1)).toBe(true);
    expect(memory.isWatched(103, 1)).toBe(true);
    expect(memory.isWatched(104, 96)).toBe(false);
    expect(memory.isWatched(201, 1)).toBe(true);
    expect(memory.isWatched(202, 98)).toBe(false);
    expect(memory.isWatched(331, 1)).toBe(true);
    expect(memory.isWatched(332, 68)).toBe(false);
    // The empty array Console: its terminator.
    expect(memory.isWatched(400, 1)).toBe(true);
    expect(memory.isWatched(401, 1000)).toBe(false);
    memory.setLittleEndian(96, 0x01020304, 4);
    memory.setLittleEndian(104, 0x01020304, 4);
    expect(changes).toEqual([]);
    // A dword straddling the start of the display.
    memory.setLittleEndian(98, 0x01020304, 4);
    expect(changes).toEqual(['7-Segment', '7-Segment']);
  });

  it('moves and resizes the ranges with the configuration', () => {
    const { devices, memory } = setup();
    devices.graphics.address = 1000;
    expect(memory.isWatched(1000, 1)).toBe(true);
    expect(memory.isWatched(1032, 1)).toBe(false);
    devices.graphics.mode = 'truecolor';
    expect(memory.isWatched(1000 + 16 * 16 * 4 - 1, 1)).toBe(true);
    devices.graphics.width = 2;
    devices.graphics.height = 1;
    expect(memory.isWatched(1008, 1)).toBe(false);
    devices.sevenSegment.address = 2000;
    devices.sevenSegment.digits = 8;
    expect(memory.isWatched(2007, 1)).toBe(true);
    expect(memory.isWatched(2008, 1)).toBe(false);
    devices.stripLight.address = 3000;
    devices.stripLight.bars = 32;
    expect(memory.isWatched(3003, 1)).toBe(true);
    devices.stripLight.bars = 8;
    expect(memory.isWatched(3001, 1)).toBe(false);
    // The console is still at 0, the old graphics bytes are free.
    expect(memory.isWatched(0, 1)).toBe(true);
    expect(memory.isWatched(1, 999)).toBe(false);
  });

  it('follows the array Console string as it grows and shrinks; pipe mode watches one byte', () => {
    const { session, devices, memory, changes } = setup();
    devices.console.setAddress(500, devices.read);
    memory.set(502, 0x43);
    expect(changes).toEqual([]);
    memory.setLittleEndian(500, 0x4241, 2);
    expect(devices.console.text).toBe('ABC');
    expect(memory.isWatched(503, 1)).toBe(true);
    expect(memory.isWatched(504, 1)).toBe(false);
    memory.set(501, 0);
    expect(devices.console.text).toBe('A');
    expect(memory.isWatched(502, 1)).toBe(false);
    expect(changes).toEqual(['Console', 'Console', 'Console']);
    devices.console.setMode('pipe', devices.read);
    expect(memory.isWatched(500, 1)).toBe(true);
    expect(memory.isWatched(501, 1)).toBe(false);
    run(session, "mov al, 'x'\nmov [500], al\nmov [501], al");
    expect(devices.console.text).toBe('x');
  });

  it('notifies devices from compiled Run code, also for pushes and calls', () => {
    const { session, devices, changes } = setup();
    devices.sevenSegment.address = 60;
    devices.console.setMode('pipe', devices.read);
    devices.console.setAddress(2000, devices.read);
    devices.graphics.address = 1000;
    session.setText(
      [
        'mov esp, 64',
        'mov ecx, 26',
        'mov ebx, 97',
        'l: mov [2000], bl',
        'inc ebx',
        'push ecx',
        'call f',
        'pop eax',
        'loop l',
        'jmp e',
        'f: mov [ecx*4+1000], eax',
        'ret',
        'e: nop',
      ].join('\n'),
    );
    session.interpreter.beginRun(() => false);
    let outcome;
    do outcome = session.interpreter.runSteps(1000, () => false);
    while (outcome.kind === 'continue');
    session.interpreter.endRun();
    expect(outcome).toEqual({ kind: 'end' });
    expect(session.interpreter.runStats.compiled).toBeGreaterThan(100);
    expect(devices.console.text).toBe('abcdefghijklmnopqrstuvwxyz');
    // push ecx: [60, 64); call f: [56, 60), outside the display.
    expect(changes.filter((c) => c === '7-Segment')).toHaveLength(26 * 4);
    // ecx*4+1000 for ecx = 26..1: bytes 1004..1107, the display is [1000, 1032).
    expect(changes.filter((c) => c === 'Graphics')).toHaveLength(7 * 4);
  });

  it('notifies exactly as a listener for every write would (random devices and programs)', () => {
    let seed = 1;
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 2 ** 32;
    };
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
    for (let round = 0; round < 60; round++) {
      const config = {
        seven: [Math.floor(random() * 200), 1 + Math.floor(random() * 8)],
        strip: [Math.floor(random() * 200), 1 + Math.floor(random() * 32)],
        graphics: [
          Math.floor(random() * 200),
          pick(['binary', '8colors', 'truecolor'] as const),
          1 + Math.floor(random() * 8),
        ],
        console: [Math.floor(random() * 200), pick(['array', 'pipe'] as const)],
      } as const;
      // Random stores, stack operations and a string growing at the Console, in 256 bytes.
      const lines = ['mov esp, ' + (64 + 4 * Math.floor(random() * 48)), 'mov ecx, 40', 'l:'];
      for (let k = 0; k < 8; k++) {
        const target = pick([
          `[ecx*${pick([1, 2, 4])}+${Math.floor(random() * 96)}]`,
          `[${Math.floor(random() * 256)}]`,
          `[edi+${config.console[0] + Math.floor(random() * 3)}]`,
        ]);
        const [size, register] = pick([
          ['byte', 'al'],
          ['word', 'ax'],
          ['dword', 'eax'],
        ]);
        const value = pick(['0', '65', '7', '10', register]);
        lines.push(
          value === register ? `mov ${target}, ${register}` : `mov ${size} ${target}, ${value}`,
        );
        lines.push(
          pick(['push ecx\npop esi', 'call f', 'push ax\npop dx', 'add eax, ecx', 'nop', 'nop']),
        );
      }
      lines.push('mov edi, 40', 'sub edi, ecx', 'loop l', 'jmp e', 'f: inc eax', 'ret', 'e: nop');
      const source = lines.join('\n');
      const results = [false, true].map((everyWrite) => {
        const session = new MachineSession({ memorySize: 4096, offset: 0 });
        if (everyWrite) {
          // As before ranges existed: the devices hear every write (all on the slow path).
          const memory = session.dsp.memory;
          const all = [{ start: -Infinity, end: Infinity }];
          const addListener = memory.addListener.bind(memory);
          const watch = memory.watch.bind(memory);
          memory.addListener = (listener) => addListener(listener, all);
          memory.watch = (listener) => watch(listener, all);
        }
        const devices = new DeviceSet(session, () => 0.1);
        const changes: DeviceChange[] = [];
        devices.subscribe((change) => changes.push(change));
        devices.sevenSegment.address = config.seven[0];
        devices.sevenSegment.digits = config.seven[1];
        devices.stripLight.address = config.strip[0];
        devices.stripLight.bars = config.strip[1];
        devices.graphics.address = config.graphics[0];
        devices.graphics.mode = config.graphics[1];
        devices.graphics.width = config.graphics[2];
        devices.graphics.height = config.graphics[2];
        devices.console.setMode(config.console[1], devices.read);
        devices.console.setAddress(config.console[0], devices.read);
        const log: string[] = [];
        devices.subscribe(() => log.push(devices.console.text));
        session.setText(source);
        session.interpreter.beginRun(() => false);
        let outcome;
        do outcome = session.interpreter.runSteps(97, () => false);
        while (outcome.kind === 'continue');
        session.interpreter.endRun();
        expect(outcome, source).toEqual({ kind: 'end' });
        return JSON.stringify({
          changes,
          log,
          memory: [...session.dsp.memory.bytes.slice(0, 512)],
        });
      });
      expect(results[0], source).toBe(results[1]);
    }
  });
});
