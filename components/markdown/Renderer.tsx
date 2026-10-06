/**
 * Markdown renderer with semantic block directives + diagrams.
 *
 * Composes:
 *   - react-markdown + remark-gfm + rehype-highlight for standard GFM
 *   - parseBlocks for our :::concept / :::important / etc. blocks
 *   - parseDiagrams for ```mermaid / ```plantuml (and :::mermaid /
 *     :::plantuml) blocks, rendered by DiagramBlock
 *
 * NOTE: For simplicity we split the stream into plain-Markdown
 * chunks delegated to react-markdown. Custom blocks and diagrams
 * are rendered with custom React components.
 */
"use client";
import { useMemo, type ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { parseBlocks, type SemanticBlockKind } from "@/lib/markdown/blocks";
import { parseDiagrams } from "@/lib/markdown/diagrams";
import { DiagramBlock } from "./DiagramBlock";
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
  const segments = useMemo(() => parseDiagrams(source), [source]);
  return (
    <div className={className} data-reading-mode={reading ? "true" : undefined}>
      {segments.map((segment, i) => {
        if (segment.kind === "diagram") {
          return <DiagramBlock key={`d-${i}`} diagram={segment.diagram} />;
        }
        const nodes = parseBlocks(segment.content);
        return nodes.map((n, j) => {
        if (n.type === "semantic") {
          const Cmp = BLOCK_RENDERERS[n.block.kind];
          return (
            <Cmp key={`b-${i}-${j}`} title={n.block.title} body={n.block.body} />
          );
        }
        return (
          <div key={`m-${i}-${j}`} className="prose-block">
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
      });
      })}
    </div>
  );
}