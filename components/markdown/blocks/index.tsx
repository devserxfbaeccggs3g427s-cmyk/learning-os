import { Lightbulb, AlertCircle, FlaskConical, AlertTriangle, MessageCircleQuestion, Microscope, HelpCircle, CheckCircle2, Layers, ListChecks, ShieldAlert, FileText } from "lucide-react";
import { SemanticBlock } from "./SemanticBlock";

export function ConceptBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Concept"} icon={<Lightbulb className="h-4 w-4" />} body={body} tone="info" />;
}
export function ImportantBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Important"} icon={<AlertCircle className="h-4 w-4" />} body={body} tone="accent" />;
}
export function ExampleBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Example"} icon={<FlaskConical className="h-4 w-4" />} body={body} tone="success" />;
}
export function FailureBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Failure scenario"} icon={<ShieldAlert className="h-4 w-4" />} body={body} tone="danger" />;
}
export function InterviewBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Interview"} icon={<MessageCircleQuestion className="h-4 w-4" />} body={body} tone="neutral" />;
}
export function LabBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Lab"} icon={<Microscope className="h-4 w-4" />} body={body} tone="info" />;
}
export function QuestionBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Question"} icon={<HelpCircle className="h-4 w-4" />} body={body} tone="neutral" />;
}
export function AnswerBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Answer"} icon={<CheckCircle2 className="h-4 w-4" />} body={body} tone="success" />;
}
export function FlashcardBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Flashcard"} icon={<Layers className="h-4 w-4" />} body={body} tone="accent" />;
}
export function QuizBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Quiz"} icon={<ListChecks className="h-4 w-4" />} body={body} tone="neutral" />;
}
export function WarningBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Warning"} icon={<AlertTriangle className="h-4 w-4" />} body={body} tone="warning" />;
}
export function SectionBlock({ title, body }: { title?: string; body: string }) {
  return <SemanticBlock title={title ?? "Section"} icon={<FileText className="h-4 w-4" />} body={body} tone="neutral" />;
}