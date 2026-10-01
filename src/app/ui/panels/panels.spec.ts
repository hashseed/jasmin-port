import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MachineSession } from '../../core';
import { DocumentStore } from '../../services/document-store';
import { FpuPanel } from './fpu/fpu-panel';
import { MemoryPanel } from './memory/memory-panel';
import { FlagsPanel } from './registers/flags-panel';
import { RegistersPanel } from './registers/registers-panel';

async function render<T>(
  component: Type<T>,
  doc: DocumentStore,
): Promise<{ fixture: ComponentFixture<T>; element: HTMLElement }> {
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('doc', doc);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function input(element: HTMLElement, label: string): HTMLInputElement {
  const found = element.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`no input ${label}`);
  return found;
}

function type(field: HTMLInputElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

describe('data panels', () => {
  let doc: DocumentStore;

  beforeEach(() => {
    doc = new DocumentStore(new MachineSession());
  });

  it('registers: shows ±dec at start, switches radix and edits', async () => {
    const { fixture, element } = await render(RegistersPanel, doc);
    const radios = [...element.querySelectorAll('[role=radio]')];
    expect(radios.map((r) => r.textContent?.trim())).toEqual(['bin', '±dec', 'dec', 'hex']);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(input(element, 'ESP').value).toBe('4096');

    (radios[3] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(input(element, 'ESP').value).toBe('0x00001000');

    const version = doc.version();
    type(input(element, 'EAX'), 'ff');
    await fixture.whenStable();
    expect(doc.session.dsp.registers.get(doc.session.dsp.EAX)).toBe(255);
    expect(doc.version()).toBe(version + 1);
    expect(input(element, 'EAX').value).toBe('0x000000FF');

    type(input(element, 'EAX'), 'junk');
    await fixture.whenStable();
    expect(input(element, 'EAX').value).toBe('0x000000FF');
  });

  it('registers: expands a row into byte fields', async () => {
    const { fixture, element } = await render(RegistersPanel, doc);
    element.querySelector<HTMLButtonElement>('[aria-label="Expand EBX"]')!.click();
    await fixture.whenStable();
    const labels = [...element.querySelectorAll('[data-register="EBX"] .label')].map((l) =>
      l.textContent?.trim(),
    );
    expect(labels.filter(Boolean)).toEqual(['EBX', 'BX', 'BH', 'BL']);
    type(input(element, 'EBX byte 2'), '1');
    await fixture.whenStable();
    expect(doc.session.dsp.registers.get(doc.session.dsp.EBX)).toBe(0x10000);
  });

  it('flags: spec labels in order, clicking sets the flag', async () => {
    const { fixture, element } = await render(FlagsPanel, doc);
    const labels = [...element.querySelectorAll('label')].map((l) => l.textContent?.trim());
    expect(labels).toEqual([
      'Carry',
      'Overflow',
      'Sign',
      'Zero',
      'Parity',
      'Auxiliary',
      'Trap',
      'Direction',
    ]);
    const boxes = element.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    boxes[3].click();
    await fixture.whenStable();
    expect(doc.session.dsp.fZero).toBe(true);
    expect(doc.session.dsp.fCarry).toBe(false);
  });

  it('fpu: names relative to TOP, ST0 bold, editable', async () => {
    doc.session.dsp.fpu.push(1.5);
    const { fixture, element } = await render(FpuPanel, doc);
    const names = [...element.querySelectorAll('tbody th')].map((t) => t.textContent?.trim());
    expect(names).toEqual(['ST1', 'ST2', 'ST3', 'ST4', 'ST5', 'ST6', 'ST7', 'ST0']);
    expect(element.querySelector('tr.top th')?.textContent?.trim()).toBe('ST0');
    expect(input(element, 'ST0 value').value).toBe('1.5');
    type(input(element, 'ST1 value'), '3');
    await fixture.whenStable();
    expect(doc.session.dsp.fpu.registers[0]).toBe(3);
    expect(input(element, 'ST1 value').value).toBe('3.0');
  });

  it('memory: header and toolbar', async () => {
    const { element } = await render(MemoryPanel, doc);
    const headers = [...element.querySelectorAll('[role=columnheader]')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headers).toEqual(['address', 'signed int', 'unsigned int', 'hex']);
    const toggles = [...element.querySelectorAll('app-segmented-toggles button')];
    expect(toggles.map((t) => [t.textContent?.trim(), t.getAttribute('aria-pressed')])).toEqual([
      ['desc', 'false'],
      ['hex', 'true'],
      ['highlight', 'false'],
    ]);
    const widths = [...element.querySelectorAll('[role=radio]')];
    expect(widths.map((w) => [w.textContent?.trim(), w.getAttribute('aria-checked')])).toEqual([
      ['8 Bit', 'false'],
      ['16Bit', 'false'],
      ['32Bit', 'true'],
    ]);
  });
});
