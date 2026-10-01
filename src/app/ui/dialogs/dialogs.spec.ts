import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialogs';

const button = (dialog: Element, text: string) =>
  [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

const nameOf = (dialog: Element) =>
  document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent;

describe('DialogService', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  it('message: shows the exact text in a modal alert dialog and resolves on OK', async () => {
    const dialogs = TestBed.inject(DialogService);
    let closed = false;
    const done = dialogs.message('Not a Jasmin memory file.').then(() => (closed = true));
    TestBed.tick();

    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(nameOf(dialog)).toBe('Not a Jasmin memory file.');
    expect(dialog.querySelector('h2')?.textContent).toBe('Message');
    expect(closed).toBe(false);

    button(dialog, 'OK').click();
    await done;
    expect(closed).toBe(true);
  });

  it('prompt: starts with the value and resolves to the entered text, or null on Cancel', async () => {
    const dialogs = TestBed.inject(DialogService);
    const answer = dialogs.prompt('Please enter the number of digits: (1-8)', '4');
    TestBed.tick();
    let dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(nameOf(dialog)).toBe('Please enter the number of digits: (1-8)');
    expect(dialog.querySelector('h2')?.textContent).toBe('Input');
    const field = dialog.querySelector('input')!;
    expect(field.value).toBe('4');
    field.value = '6';
    button(dialog, 'OK').click();
    expect(await answer).toBe('6');

    const cancelled = dialogs.prompt('Again?', '1');
    TestBed.tick();
    dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    button(dialog, 'Cancel').click();
    expect(await cancelled).toBeNull();
  });

  it('choose: offers the options plus Cancel and resolves to the index', async () => {
    const dialogs = TestBed.inject(DialogService);
    const choice = dialogs.choose('Choose the color:', ['blue', 'jasmin']);
    TestBed.tick();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.querySelector('h2')?.textContent).toBe('Please choose');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
      'blue',
      'jasmin',
      'Cancel',
    ]);
    button(dialog, 'jasmin').click();
    expect(await choice).toBe(1);
  });
});
