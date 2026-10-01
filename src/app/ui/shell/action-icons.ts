import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideCamera,
  LucideClipboardPaste,
  LucideCopy,
  LucideFilePlus,
  LucideFolderOpen,
  LucideHistory,
  LucideIcon,
  LucidePause,
  LucidePlay,
  LucideRedo2,
  LucideRotateCcw,
  LucideSave,
  LucideScissors,
  LucideSquare,
  LucideStepForward,
  LucideTextCursorInput,
  LucideUndo2,
} from '@lucide/angular';
import { ActionId } from '../../services/actions.service';

/** Lucide icons of the toolbar and menus (docs/plan.md, "Icons mapping"). */
export const ACTION_ICONS: Partial<Record<ActionId, LucideIcon>> = {
  new: LucideFilePlus,
  open: LucideFolderOpen,
  save: LucideSave,
  undo: LucideUndo2,
  redo: LucideRedo2,
  cut: LucideScissors,
  copy: LucideCopy,
  paste: LucideClipboardPaste,
  back: LucideArrowLeft,
  forward: LucideArrowRight,
  run: LucidePlay,
  runPause: LucidePlay,
  pause: LucidePause,
  step: LucideStepForward,
  executeLine: LucideTextCursorInput,
  stop: LucideSquare,
  reset: LucideRotateCcw,
  takeSnapshot: LucideCamera,
  loadSnapshot: LucideHistory,
};

export const PAUSE_ICON: LucideIcon = LucidePause;
