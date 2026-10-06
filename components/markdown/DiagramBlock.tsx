/**
 * Diagram block renderer: mermaid + plantuml.
 *
 * Two syntaxes supported by MarkdownRenderer:
 *
 *   ```mermaid
 *   graph TD; A-->B;
 *   ```
 *
 *   :::mermaid
 *   graph TD; A-->B;
 *   :::
 *
 *   :::plantuml
 *   @startuml
 *   A -> B
 *   @enduml
 *   :::
 *
 * Mermaid renders client-side (dynamic import, no backend).
 * PlantUML is encoded and rendered via the public plantuml.com
 * server (SVG image URL), so it works with zero local deps.
 */
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { encode as encodePuml } from "plantuml-encoder";
import { ImageOff, Maximize2 } from "lucide-react";
import type { DiagramDefinition } from "@/lib/markdown/diagrams";

const PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg";

export function DiagramBlock({ diagram }: { diagram: DiagramDefinition }) {
  if (diagram.type === "plantuml") {
    return <PlantUmlImage source={diagram.source} />;
  }
  return <MermaidCanvas source={diagram.source} />;
}

function MermaidCanvas({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mmd-${Math.random().toString(36).slice(2, 9)}`);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "default",
          securityLevel: "loose",
        });
        const { svg } = await mermaid.render(idRef.current, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      // mermaid leaves temp DOM nodes keyed by id; clean them up.
      document.getElementById(idRef.current)?.remove();
      document.getElementById(`d${idRef.current}`)?.remove();
    };
  }, [source]);

  if (error) {
    return <DiagramError error={error} source={source} />;
  }

  return (
    <figure className="my-4 rounded-lg border border-border bg-muted/20 p-4">
      <div ref={containerRef} className="flex justify-center overflow-x-auto" />
      <DiagramCaption label="mermaid" />
    </figure>
  );
}

function PlantUmlImage({ source }: { source: string }) {
  const encoded = useMemo(() => encodePuml(source), [source]);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <DiagramError
        error="PlantUML server unreachable or syntax error"
        source={source}
      />
    );
  }

  return (
    <figure className="my-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex justify-center overflow-x-auto">
        <img
          src={`${PLANTUML_SERVER}/${encoded}`}
          alt="PlantUML diagram"
          className="max-w-full"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
      <DiagramCaption
        label="plantuml"
        href={`https://www.plantuml.com/plantuml/uml/${encoded}`}
        linkLabel="Open on plantuml.com"
      />
    </figure>
  );
}

function DiagramCaption({
  label,
  href,
  linkLabel,
}: {
  label: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <figcaption className="mt-2 flex items-center justify-between text-xs opacity-60">
      <span>{label}</span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:opacity-100"
        >
          <Maximize2 className="h-3 w-3" />
          {linkLabel}
        </a>
      )}
    </figcaption>
  );
}

function DiagramError({ error, source }: { error: string; source: string }) {
  return (
    <aside className="my-4 rounded-lg border-l-4 border-red-500/40 bg-red-500/5 px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide opacity-90">
        <ImageOff className="h-4 w-4" />
        Diagram error
      </div>
      <pre className="whitespace-pre-wrap text-xs opacity-80">{error}</pre>
      <pre className="mt-2 overflow-x-auto rounded bg-black/20 p-2 text-xs">
        {source}
      </pre>
    </aside>
  );
}
