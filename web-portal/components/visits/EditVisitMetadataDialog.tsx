'use client';

import { FormEvent, useEffect, useState } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type EditVisitMetadataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: {
    provider?: string | null;
    location?: string | null;
    specialty?: string | null;
    notes?: string | null;
    visitDate?: string | null;
  };
  onSave: (payload: {
    provider: string;
    location: string;
    specialty: string;
    notes: string;
    visitDate: string | null;
  }) => Promise<void> | void;
  isSaving?: boolean;
};

export function EditVisitMetadataDialog({
  open,
  onOpenChange,
  initialValues,
  onSave,
  isSaving,
}: EditVisitMetadataDialogProps) {
  const [provider, setProvider] = useState(initialValues.provider ?? '');
  const [location, setLocation] = useState(initialValues.location ?? '');
  const [specialty, setSpecialty] = useState(initialValues.specialty ?? '');
  const [notes, setNotes] = useState(initialValues.notes ?? '');
  const [visitDateTime, setVisitDateTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProvider(initialValues.provider ?? '');
      setLocation(initialValues.location ?? '');
      setSpecialty(initialValues.specialty ?? '');
      setNotes(initialValues.notes ?? '');
      setVisitDateTime(
        initialValues.visitDate
          ? toLocalDateTimeInput(initialValues.visitDate)
          : null,
      );
      setError(null);
    }
  }, [initialValues, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await onSave({
        provider: provider.trim(),
        location: location.trim(),
        specialty: specialty.trim(),
        notes: notes.trim(),
        visitDate: visitDateTime ? new Date(visitDateTime).toISOString() : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save changes. Try again.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit visit details</DialogTitle>
          <DialogDescription>
            Update provider information, visit metadata, or add private notes that stay synced between devices.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Provider">
              <Input
                placeholder="Dr. Jane Smith"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </Field>
            <Field label="Location">
              <Input
                placeholder="UCSF Cardiology"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
            <Field label="Specialty">
              <Input
                placeholder="Cardiology"
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
              />
            </Field>
            <Field label="Visit date & time">
              <Input
                type="datetime-local"
                value={visitDateTime ?? ''}
                onChange={(event) => setVisitDateTime(event.target.value || null)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              placeholder="Add any personal notes or reminders. These stay private to you."
              value={notes}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted-foreground">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function toLocalDateTimeInput(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const off = date.getTimezoneOffset();
  const local = new Date(date.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

