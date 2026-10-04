/**
 * Drizzle schema aggregator.
 *
 * Each domain area lives in its own file. This file re-exports everything
 * so drizzle-kit can discover the full schema from one path.
 */
export * from "./users";
export * from "./roadmap";
export * from "./tasks";
export * from "./schedule";
export * from "./sessions";
export * from "./notes";
export * from "./ai";
export * from "./aiFrames";
export * from "./flashcards";
export * from "./quizzes";
export * from "./reviews";
export * from "./mastery";
export * from "./settings";
export * from "./tags";
export * from "./audit";