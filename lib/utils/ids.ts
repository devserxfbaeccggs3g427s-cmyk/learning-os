/**
 * Lightweight ID helpers. We don't pull a heavy ULID library; nanoid is
 * fine for unique DB IDs.
 */
import { customAlphabet } from "nanoid";

// URL-safe alphabet, no ambiguous chars.
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const newId = customAlphabet(alphabet, 16);

/** Stable prefix for each table — makes IDs grep-friendly. */
export const ids = {
  user: () => `usr_${newId()}`,
  roadmap: () => `rm_${newId()}`,
  track: () => `tr_${newId()}`,
  module: () => `md_${newId()}`,
  task: () => `ts_${newId()}`,
  taskDep: () => `td_${newId()}`,
  schedule: () => `sd_${newId()}`,
  block: () => `sb_${newId()}`,
  session: () => `ss_${newId()}`,
  note: () => `tn_${newId()}`,
  noteRev: () => `nr_${newId()}`,
  blockNote: () => `bn_${newId()}`,
  blockNoteRev: () => `br_${newId()}`,
  aiConv: () => `ac_${newId()}`,
  aiMsg: () => `am_${newId()}`,
  aiArtifact: () => `ar_${newId()}`,
  aiFrame: () => `af_${newId()}`,
  aiFrameMsg: () => `fm_${newId()}`,
  aiFrameSnippet: () => `fs_${newId()}`,
  deck: () => `dk_${newId()}`,
  card: () => `cr_${newId()}`,
  quiz: () => `qz_${newId()}`,
  question: () => `qq_${newId()}`,
  attempt: () => `qa_${newId()}`,
  answer: () => `qan_${newId()}`,
  review: () => `rh_${newId()}`,
  reviewSession: () => `rs_${newId()}`,
  mastery: () => `my_${newId()}`,
  setting: () => `st_${newId()}`,
  aiConfig: () => `ai_${newId()}`,
  prompt: () => `pt_${newId()}`,
  tag: () => `tg_${newId()}`,
  audit: () => `au_${newId()}`,
} as const;