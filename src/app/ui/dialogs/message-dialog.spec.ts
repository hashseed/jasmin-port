import { TestBed } from '@angular/core/testing';
import { DialogService } from './message-dialog';

describe('DialogService.message', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  it('shows the exact text in a modal alert dialog and resolves on OK', async () => {
    const dialogs = TestBed.inject(DialogService);
    let closed = false;
    const done = dialogs.message('Not a Jasmin memory file.').then(() => (closed = true));
    TestBed.tick();

    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Not a Jasmin memory file.');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe('Message');
    expect(closed).toBe(false);

    const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'OK');
    ok!.click();
    await done;
    expect(closed).toBe(true);
  });
});
