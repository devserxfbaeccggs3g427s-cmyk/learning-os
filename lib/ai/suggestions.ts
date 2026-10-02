import type { PromptTopic } from "@/components/ai/ChatSuggestions";

/**
 * Topic-organized fallback suggestions for the **Global AI Chat**.
 * The component caps display at 3 cards, so we keep the fallback compact
 * (1 topic, 3 prompts) and let AI-generated batches vary.
 */
export const GLOBAL_PROMPT_TOPICS: PromptTopic[] = [
  {
    id: "starter",
    title: "Get started",
    description: "Three quick ways to use global AI.",
    prompts: [
      { label: "What's on my schedule today?", prompt: "What's on my schedule today?" },
      { label: "What should I study next?", prompt: "Based on my roadmap progress, what should I learn next?" },
      { label: "Find my knowledge gaps", prompt: "Based on my notes and quiz history, where are my biggest knowledge gaps?" },
    ],
  },
];

/**
 * Topic-organized fallback suggestions for the **task-scoped AI Tutor**.
 * Same shape — 1 topic with 3 starter prompts interpolated with the task title.
 */
export const TUTOR_PROMPT_TOPICS = (taskTitle: string): PromptTopic[] => [
  {
    id: "starter",
    title: taskTitle,
    description: "Starter prompts for this task.",
    prompts: [
      { label: "Explain from scratch", prompt: `Explain the task "${taskTitle}" to me from scratch.` },
      { label: "Why it matters", prompt: `Why does "${taskTitle}" matter in production?` },
      { label: "Most common failure mode", prompt: `What is the most common production failure mode for "${taskTitle}"?` },
    ],
  },
];