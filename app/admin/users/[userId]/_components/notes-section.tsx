'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';

import { addUserNoteAction, archiveUserNoteAction } from '../../actions';

interface Note {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  userId: string;
  initialNotes: Note[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotesSection({ userId, initialNotes }: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addUserNoteAction(userId, body);
      if (result.success) {
        toast.success('Notatka dodana');
        setBody('');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleArchive = (noteId: string) => {
    startTransition(async () => {
      const result = await archiveUserNoteAction(noteId);
      if (result.success) {
        toast.success('Zarchiwizowano');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Notatki wewnętrzne
        </h2>
        <span className="text-xs text-muted-foreground">
          {initialNotes.length} aktywnych
        </span>
      </header>

      <div className="rounded-2xl border border-glass-border bg-foreground/3 p-4 backdrop-blur-glass">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder='Krótka notatka dla siebie / kolegi (max 5000 znaków). Np. „Karta odrzucona 2026-05-03, klient prosi o refund po fix Stripe".'
          className="resize-none border-glass-border bg-background/50"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {body.length} / 5000
          </span>
          <Button
            size="sm"
            disabled={isPending || !body.trim()}
            onClick={handleAdd}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Dodaj
          </Button>
        </div>
      </div>

      {initialNotes.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Brak notatek"
          description="Pierwszą napiszesz powyżej — przyda się gdy klient napisze za miesiąc i nie pamiętasz kontekstu."
        />
      ) : (
        <ul className="space-y-2">
          {initialNotes.map((note) => (
            <li
              key={note.id}
              className="rounded-2xl border border-glass-border bg-foreground/3 p-4 backdrop-blur-glass"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {note.authorEmail}
                    </span>
                    <span>·</span>
                    <span>{formatTimestamp(note.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {note.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleArchive(note.id)}
                  disabled={isPending}
                  aria-label="Zarchiwizuj notatkę"
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
