import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn` — Tailwind-aware class merger.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}