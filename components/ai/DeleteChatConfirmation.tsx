import { Button } from "@/components/ui";

interface DeleteChatConfirmationProps {
  message: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteChatConfirmation({ message, busy, onConfirm, onCancel }: DeleteChatConfirmationProps) {
  return (
    <div role="group" aria-label={message} className="space-y-2 px-2 pb-2 text-xs">
      <p className="text-destructive">{message} This cannot be undone.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy ? "Deleting…" : "Delete"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
