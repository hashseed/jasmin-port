import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  InjectionToken,
  Signal,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MachineConfig, MachineSession } from '../core';
import { DocumentStore } from './document-store';
import { SettingsService } from './settings.service';

/** Creates the machine of a new document; tests replace it to control time. */
export const SESSION_FACTORY = new InjectionToken<(config: MachineConfig) => MachineSession>(
  'SESSION_FACTORY',
  { providedIn: 'root', factory: () => (config) => new MachineSession(config) },
);

/** Pages a help tab can show (spec 02 §12). */
export type HelpPage = 'welcome' | 'configuration';

/** A place in a help tab: a page and optionally an anchor on it (`Welcome.htm#credits`). */
export interface HelpLocation {
  readonly page: HelpPage;
  readonly anchor: string | null;
}

const HELP_TITLES: Record<HelpPage, string> = {
  welcome: 'Welcome',
  configuration: 'Configuration',
};

let nextHelpId = 1;

/**
 * A help tab with its own back/forward history (07 Q-UI-4: plain stacks). Like
 * the original's URL history, a location includes its anchor, so following the
 * `Credits` link is a step Back can undo.
 */
export class HelpTab {
  readonly id = `help-${nextHelpId++}`;
  private readonly current: WritableSignal<HelpLocation>;
  private readonly backStack = signal<HelpLocation[]>([]);
  private readonly forwardStack = signal<HelpLocation[]>([]);
  /** The tab keeps the title it was opened with. */
  readonly title: string;
  readonly location: Signal<HelpLocation>;
  readonly page = computed(() => this.location().page);
  readonly canBack = computed(() => this.backStack().length > 0);
  readonly canForward = computed(() => this.forwardStack().length > 0);

  constructor(page: HelpPage) {
    this.current = signal({ page, anchor: null });
    this.location = this.current.asReadonly();
    this.title = HELP_TITLES[page];
  }

  navigate(page: HelpPage, anchor: string | null = null): void {
    const here = this.current();
    if (page === here.page && anchor === here.anchor) return;
    this.backStack.update((s) => [...s, here]);
    this.forwardStack.set([]);
    this.current.set({ page, anchor });
  }

  back(): void {
    const stack = this.backStack();
    if (!stack.length) return;
    this.forwardStack.update((s) => [...s, this.current()]);
    this.current.set(stack[stack.length - 1]);
    this.backStack.set(stack.slice(0, -1));
  }

  forward(): void {
    const stack = this.forwardStack();
    if (!stack.length) return;
    this.backStack.update((s) => [...s, this.current()]);
    this.current.set(stack[stack.length - 1]);
    this.forwardStack.set(stack.slice(0, -1));
  }
}

export type Tab =
  | { readonly kind: 'help'; readonly id: string; readonly help: HelpTab }
  | { readonly kind: 'document'; readonly id: string; readonly doc: DocumentStore };

/**
 * The open tabs (spec 02 §1): help pages and documents in opening order, and
 * the selected one. New tabs are appended and selected.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly settings = inject(SettingsService);
  private readonly createSession = inject(SESSION_FACTORY);

  private readonly tabList = signal<readonly Tab[]>([]);
  private readonly selectedId = signal<string | null>(null);

  readonly tabs: Signal<readonly Tab[]> = this.tabList.asReadonly();
  readonly selected = computed(
    () => this.tabList().find((t) => t.id === this.selectedId()) ?? null,
  );
  /** The selected document, or null when a help tab (or nothing) is selected. */
  readonly document = computed(() => {
    const tab = this.selected();
    return tab?.kind === 'document' ? tab.doc : null;
  });
  /** The selected help tab, or null. */
  readonly help = computed(() => {
    const tab = this.selected();
    return tab?.kind === 'help' ? tab.help : null;
  });
  /** Some open document has edits not yet saved to its file. */
  readonly hasUnsavedEdits = computed(() =>
    this.tabList().some((t) => t.kind === 'document' && t.doc.modified()),
  );

  constructor() {
    // Q-UI-5 (spec 02 §1 port note): the only unsaved-changes prompt is the
    // browser's own, and the listener is registered only while there are edits.
    const win = inject(DOCUMENT).defaultView;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'unsaved';
    };
    let registered = false;
    const setRegistered = (on: boolean) => {
      if (!win || on === registered) return;
      registered = on;
      if (on) win.addEventListener('beforeunload', onBeforeUnload);
      else win.removeEventListener('beforeunload', onBeforeUnload);
    };
    effect(() => setRegistered(this.hasUnsavedEdits()));
    inject(DestroyRef).onDestroy(() => setRegistered(false));
  }

  /** File > New: a document titled `new program` (spec 09 §2). */
  newDocument(title = 'new program', text = ''): DocumentStore {
    const session = this.createSession({
      memorySize: this.settings.get('memory'),
      offset: this.settings.get('offset'),
    });
    const doc = new DocumentStore(session, title, {
      split1: this.settings.get('split1.location'),
      split2: this.settings.get('split2.location'),
      split3: this.settings.get('split3.location'),
      split4: this.settings.get('split4.location'),
    });
    if (text) doc.setText(text);
    this.add({ kind: 'document', id: `doc-${doc.id}`, doc });
    return doc;
  }

  openHelp(page: HelpPage): HelpTab {
    const help = new HelpTab(page);
    this.add({ kind: 'help', id: help.id, help });
    return help;
  }

  select(id: string): void {
    if (this.tabList().some((t) => t.id === id)) this.selectedId.set(id);
  }

  /** Closes a tab without prompting (spec 02 §1); selects a neighbour. */
  close(id: string): void {
    const tabs = this.tabList();
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const tab = tabs[index];
    if (tab.kind === 'document') tab.doc.dispose();
    const rest = tabs.filter((t) => t.id !== id);
    this.tabList.set(rest);
    if (this.selectedId() === id) {
      this.selectedId.set(rest[Math.min(index, rest.length - 1)]?.id ?? null);
    }
  }

  closeSelected(): void {
    const id = this.selectedId();
    if (id) this.close(id);
  }

  closeAll(): void {
    for (const tab of this.tabList()) this.close(tab.id);
  }

  private add(tab: Tab): void {
    this.tabList.update((tabs) => [...tabs, tab]);
    this.selectedId.set(tab.id);
  }
}
