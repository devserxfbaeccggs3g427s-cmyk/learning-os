/**
 * Markdown renderer with semantic block directives.
 *
 * Composes:
 *   - react-markdown + remark-gfm + rehype-highlight for standard GFM
 *   - remarkCustomBlocks for our :::concept / :::important / etc. blocks
 *
 * NOTE: For simplicity we use remark-gfm + react-markdown and wrap the
 * whole stream in a "split by ::: fences" parser. The plain-Markdown
 * chunks between fences are delegated to react-markdown. Custom blocks
 * are rendered with custom React components keyed by their kind.
 */
"use client";
import { useMemo, type ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { parseBlocks, type SemanticBlockKind } from "@/lib/markdown/blocks";
import {
  ConceptBlock,
  ImportantBlock,
  ExampleBlock,
  FailureBlock,
  InterviewBlock,
  LabBlock,
  QuestionBlock,
  AnswerBlock,
  FlashcardBlock,
  QuizBlock,
  WarningBlock,
  SectionBlock,
} from "./blocks";

const BLOCK_RENDERERS: Record<
  SemanticBlockKind,
  ComponentType<{ title?: string; body: string }>
> = {
  concept: ConceptBlock,
  important: ImportantBlock,
  example: ExampleBlock,
  failure: FailureBlock,
  interview: InterviewBlock,
  lab: LabBlock,
  question: QuestionBlock,
  answer: AnswerBlock,
  flashcard: FlashcardBlock,
  quiz: QuizBlock,
  warning: WarningBlock,
  section: SectionBlock,
};

interface MarkdownRendererProps {
  source: string;
  className?: string;
  /** When true, render with reading-mode typography (more spacious, no inline backgrounds). */
  reading?: boolean;
}

export function MarkdownRenderer({ source, className, reading }: MarkdownRendererProps) {
  const nodes = useMemo(() => parseBlocks(source), [source]);
  return (
    <div className={className} data-reading-mode={reading ? "true" : undefined}>
      {nodes.map((n, i) => {
        if (n.type === "semantic") {
          const Cmp = BLOCK_RENDERERS[n.block.kind];
          return (
            <Cmp key={`b-${i}`} title={n.block.title} body={n.block.body} />
          );
        }
        return (
          <div key={`m-${i}`} className="prose-block">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ node: _node, ...rest }) => (
                  <a {...rest} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {n.content || "​"}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}