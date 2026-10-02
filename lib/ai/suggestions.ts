import type { PromptTopic } from "@/components/ai/PromptSuggestions";

/**
 * Topic-organized prompt suggestions for the **Global AI Chat** (cross-task).
 * Used when the user hasn't picked a specific task — the AI still has full
 * roadmap / schedule / notes context, so suggestions lean on those.
 */
export const GLOBAL_PROMPT_TOPICS: PromptTopic[] = [
  {
    id: "today",
    title: "Today's plan",
    description: "Schedule-aware questions.",
    prompts: [
      { label: "What's on my schedule today?", prompt: "What's on my schedule today?" },
      { label: "What should I study right now?", prompt: "What should I study right now based on my schedule and roadmap progress?" },
      { label: "How is the rest of my week?", prompt: "Summarize my study plan for the rest of this week." },
      { label: "Reschedule today's blocks", prompt: "Help me rebalance today's study blocks given my progress." },
    ],
  },
  {
    id: "roadmap",
    title: "Roadmap & progress",
    description: "Navigate your learning path.",
    prompts: [
      { label: "Where am I in the roadmap?", prompt: "Where am I in the roadmap right now, and what's the big picture?" },
      { label: "What should I learn next?", prompt: "What should I learn next after my current task?" },
      { label: "Prerequisites for a task", prompt: "How do I look up the prerequisites for a specific task?" },
      { label: "Show open tasks by track", prompt: "List my open tasks grouped by track." },
    ],
  },
  {
    id: "review",
    title: "Review & gaps",
    description: "Solidify what you've learned.",
    prompts: [
      { label: "Summarize recent notes", prompt: "Summarize my recent notes across tasks." },
      { label: "Where are my knowledge gaps?", prompt: "Based on my notes and quiz history, where are my biggest knowledge gaps?" },
      { label: "Quiz me on recent material", prompt: "Quiz me on what I've learned recently." },
      { label: "Build flashcards from my notes", prompt: "Build a flashcard deck from my most recent notes." },
    ],
  },
  {
    id: "interview",
    title: "Interview prep",
    description: "Practice interview-style prompts.",
    prompts: [
      { label: "Senior interview question", prompt: "Give me one senior-level backend interview question, then wait for my answer before grading." },
      { label: "Common questions on caching", prompt: "What are commonly asked interview questions on caching?" },
      { label: "System design warm-up", prompt: "Give me a short system-design warm-up I can solve in 15 minutes." },
      { label: "Behavioral STAR prompt", prompt: "Give me one behavioral interview prompt and help me shape a STAR answer." },
    ],
  },
  {
    id: "debug",
    title: "Debug & incidents",
    description: "Production failure drills.",
    prompts: [
      { label: "Run an incident drill", prompt: "Run me through a short production incident drill — open with a dashboard panel and ask what I check first." },
      { label: "Common DB failure modes", prompt: "What are the most common database failure modes in production?" },
      { label: "Debug a slow API", prompt: "Walk me through how you'd debug a slow API endpoint in production." },
      { label: "Failure scenario for caching", prompt: "Walk me through a realistic caching failure scenario and how to detect it." },
    ],
  },
  {
    id: "concepts",
    title: "Quick concepts",
    description: "Fast refreshers.",
    prompts: [
      { label: "Explain idempotency", prompt: "Explain idempotency in 2 minutes with a concrete example." },
      { label: "CAP theorem in simple words", prompt: "Explain the CAP theorem in simple words." },
      { label: "Concurrency vs parallelism", prompt: "Explain the difference between concurrency and parallelism." },
      { label: "ACID vs BASE", prompt: "Compare ACID and BASE in a short table-friendly explanation." },
    ],
  },
];

/**
 * Topic-organized prompt suggestions for the **task-scoped AI Tutor**.
 * Suggestions interpolate the task title so the AI gets a self-contained prompt.
 */
export const TUTOR_PROMPT_TOPICS = (taskTitle: string): PromptTopic[] => [
  {
    id: "learn",
    title: "Learn this task",
    description: taskTitle,
    prompts: [
      { label: "Explain from scratch", prompt: `Explain the task "${taskTitle}" to me from scratch.` },
      { label: "Why it matters in production", prompt: `Why does "${taskTitle}" matter in production?` },
      { label: "Walk me through the internals", prompt: `Walk me through the internals of "${taskTitle}".` },
      { label: "Give me a quick definition", prompt: `Give me a 2-minute definition of "${taskTitle}".` },
    ],
  },
  {
    id: "drill",
    title: "Drill & recall",
    description: "Push your understanding.",
    prompts: [
      { label: "Most common failure mode", prompt: `What is the most common production failure mode for "${taskTitle}"?` },
      { label: "Interview question", prompt: `Ask me one interview question on "${taskTitle}", then wait for my answer.` },
      { label: "Key trade-offs", prompt: `What are the key trade-offs I should know about "${taskTitle}"?` },
      { label: "Run a debug drill", prompt: `Run a short debug drill for "${taskTitle}" — open with a dashboard and ask what I check first.` },
    ],
  },
  {
    id: "code",
    title: "Code & practice",
    description: "Hands-on learning.",
    prompts: [
      { label: "Concrete code example", prompt: `Show me a concrete code example for "${taskTitle}".` },
      { label: "Hands-on lab idea", prompt: `Suggest a hands-on lab I can do for "${taskTitle}" in 1–2 hours.` },
      { label: "Common pitfalls", prompt: `What are common pitfalls when implementing "${taskTitle}"?` },
      { label: "Build a tiny demo", prompt: `Outline a tiny end-to-end demo I can build to practice "${taskTitle}".` },
    ],
  },
  {
    id: "connect",
    title: "Connect the dots",
    description: "How this fits in.",
    prompts: [
      { label: "What comes before this", prompt: `What should I know before tackling "${taskTitle}"?` },
      { label: "What depends on this", prompt: `What tasks or concepts depend on "${taskTitle}"?` },
      { label: "How this fits the module", prompt: `How does "${taskTitle}" fit into its module and the overall roadmap?` },
      { label: "Compare to alternatives", prompt: `What are common alternatives to "${taskTitle}" and when would I pick each?` },
    ],
  },
  {
    id: "notes",
    title: "Your notes",
    description: "Work with your saved notes.",
    prompts: [
      { label: "Summarize my notes", prompt: `Summarize my notes for "${taskTitle}".` },
      { label: "Knowledge gaps in my notes", prompt: `Based on my notes for "${taskTitle}", what knowledge gaps do I have?` },
      { label: "Quiz me from my notes", prompt: `Quiz me using only my notes for "${taskTitle}".` },
      { label: "Turn notes into flashcards", prompt: `Turn my notes for "${taskTitle}" into a flashcard deck I can study.` },
    ],
  },
];