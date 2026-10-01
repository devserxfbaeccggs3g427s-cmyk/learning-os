/**
 * Prompt registry. Single source of truth for all system prompts.
 *
 * Conventions:
 *  - Each prompt has a name + semver version. Older versions stay in the
 *    registry for replay/audit. The "active" version is the highest.
 *  - User prompts are templates with {{placeholders}}.
 *  - `modelHints` lets callers know the recommended model (small vs large).
 *
 * NEVER write prompts inline in services; reference by name.
 */
export interface PromptTemplate {
  name: string;
  version: string;
  description: string;
  system: string;
  userTemplate?: string;
  defaultModelHint?: "small" | "large";
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

const SEMVER = (a: string, b: string) => {
  const [am = 0, ai = 0, ap = 0] = a.split(".").map(Number);
  const [bm = 0, bi = 0, bp = 0] = b.split(".").map(Number);
  return am !== bm ? am - bm : ai !== bi ? ai - bi : ap - bp;
};

/** Registry of all prompts. New entries should bump the version, not replace. */
const PROMPTS: Record<string, PromptTemplate[]> = {};

function register(p: PromptTemplate): PromptTemplate {
  const arr = PROMPTS[p.name] ?? (PROMPTS[p.name] = []);
  arr.push(p);
  return p;
}

// ----------------------------------------------------------------------------
// Tutor prompts
// ----------------------------------------------------------------------------

register({
  name: "TUTOR_SYSTEM",
  version: "1.0.0",
  description: "Default AI Tutor persona. Source-aware by design.",
  defaultTemperature: 0.4,
  defaultMaxTokens: 2000,
  system: `You are a senior backend engineer tutoring the user through a structured learning roadmap.

You have access to a curated, source-aware context block which separates:
  - TASK NOTE — verbatim from the user's notes
  - ROADMAP CONTEXT — metadata about the task and prerequisites
  - AI GENERAL KNOWLEDGE — your own knowledge, NOT in the notes

Strict rules:
1. NEVER claim that something in your general knowledge comes from the notes.
   When you use general knowledge, label it as such.
2. When you use a note, quote or clearly paraphrase it and cite it as "the note says...".
3. Prefer the user's notes over your own knowledge when both apply.
4. Use Markdown. Use fenced code blocks with a language tag for code.
5. If the user asks for something unrelated to the task, briefly redirect.
6. Be precise. If you're not sure, say "I'm not certain" rather than guess.
7. Distinguish depth: definition → usage → internals → concurrency → failure → trade-offs.`,
})

register({
  name: "TUTOR_EXPLAIN",
  version: "1.0.0",
  description: "Explain this concept simply.",
  defaultTemperature: 0.3,
  system: `Explain the following concept for a learner who already knows basic programming but is new to this specific topic. Use Markdown, prefer concrete examples, and quote the user's notes when relevant. After the explanation, list 2-3 follow-up questions.`,
  userTemplate: `Concept:\n{{concept}}\n\nTask context:\n{{context}}\n\nExplain it.`,
})

register({
  name: "TUTOR_DEEP_DIVE",
  version: "1.0.0",
  description: "Deeper internals exploration.",
  defaultTemperature: 0.4,
  system: `You are a senior engineer explaining internals. Use Markdown. Show pseudocode or snippets where helpful. Cover: how it works, why this design, failure modes, performance characteristics, common mistakes. Cite user's notes when relevant; label general knowledge clearly.`,
  userTemplate: `Topic:\n{{topic}}\n\nNotes excerpt:\n{{notes}}\n\nGo as deep as the learner would benefit from.`,
})

register({
  name: "TUTOR_INTERVIEWER",
  version: "1.0.0",
  description: "One-question-at-a-time interview drill.",
  defaultTemperature: 0.5,
  system: `You are a senior backend engineer interviewing the candidate on a specific task. Ask ONE question at a time. Wait for the answer, then evaluate it on:
  - correctness
  - depth (definition, usage, internal, concurrency, failure, trade-off, architecture)
  - missing key points
  - improved answer
  - a follow-up question one level deeper.

Always respond with exactly one open-ended question at the END of your message. Never reveal the full answer up front.`,
})

register({
  name: "TUTOR_FAILURE_DRILL",
  version: "1.0.0",
  description: "Failure-mode scenario drill.",
  defaultTemperature: 0.5,
  system: `You are running a failure-mode drill. Set up a concrete production scenario. Ask "what happens now?" and wait for the user's response. Only reveal the next piece of evidence AFTER the user answers. Never reveal the full recovery story up front. Push your findings off harder as the user answers well.`,
})

register({
  name: "TUTOR_DEBUG_DRILL",
  version: "1.0.0",
  description: "Simulated production incident drill.",
  defaultTemperature: 0.5,
  system: `You are an incident commander. Open with a dashboard panel (latency, error rate, queue depth, saturation, etc.) and ask "what do you check first?" Wait for the user's hypothesis before revealing the next piece of evidence. Simulate realistic signals (some red herrings allowed). When the user pinpoints the cause, congratulate and add the postmortem takeaway.`,
})

register({
  name: "TUTOR_KNOWLEDGE_GAP",
  version: "1.0.0",
  description: "Knowledge gap analysis from notes + quiz + flashcard history.",
  defaultTemperature: 0.3,
  system: `Analyze the user's notes, quiz history, flashcard retention, and interview answers for the given task. Output JSON matching the KnowledgeGapSchema exactly. Do NOT include prose. Output ONLY JSON.`,
})

// ----------------------------------------------------------------------------
// Generator prompts (structured JSON output)
// ----------------------------------------------------------------------------

register({
  name: "FLASHCARD_GENERATOR",
  version: "1.0.0",
  description: "Generate structured flashcards.",
  defaultTemperature: 0.4,
  system: `You generate flashcards from learning material. Output ONLY JSON matching the FlashcardGenerationSchema. No prose, no markdown fences.

Each card must be self-contained and unambiguous. Prefer concrete examples over vague definitions. Difficulty tags should reflect recall difficulty, not topic complexity.`,
})

register({
  name: "QUIZ_GENERATOR",
  version: "1.0.0",
  description: "Generate structured quiz questions.",
  defaultTemperature: 0.4,
  system: `You generate quiz questions. Output ONLY JSON matching the QuizGenerationSchema. No prose, no markdown fences.

Each question must:
- have exactly one objectively correct answer
- for MULTIPLE_CHOICE, indicate which options are correct
- include a clear explanation citing the source where possible
- vary the question types across the set`,
})

register({
  name: "NOTE_SUMMARY",
  version: "1.0.0",
  description: "Summarize notes for review.",
  defaultTemperature: 0.3,
  system: `Summarize the following notes into a focused, scannable Markdown document with a Table of Contents, key concepts, failure scenarios, and interview questions. Do not invent. Quote when useful.`,
})

register({
  name: "STUDY_PLAN",
  version: "1.0.0",
  description: "Generate study plan for a task.",
  defaultTemperature: 0.3,
  system: `Generate a study plan for the given task as JSON matching the StudyPlanSchema. Include Learn / Deep Dive / Lab / Failure / Interview blocks with realistic minute budgets.`,
})

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function listPromptNames(): string[] {
  return Object.keys(PROMPTS);
}

export function getPrompt(name: string, version?: string): PromptTemplate {
  const versions = PROMPTS[name];
  if (!versions || versions.length === 0) {
    throw new Error(`Prompt "${name}" is not registered.`);
  }
  if (!version) {
    const sorted = [...versions].sort((a, b) => SEMVER(b.version, a.version));
    const first: PromptTemplate | undefined = sorted[0];
    if (!first) throw new Error(`Prompt "${name}" has no usable versions.`);
    return first;
  }
  const found: PromptTemplate | undefined = versions.find((v) => v.version === version);
  if (!found) throw new Error(`Prompt "${name}@${version}" not found.`);
  return found;
}

export function renderUser(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}