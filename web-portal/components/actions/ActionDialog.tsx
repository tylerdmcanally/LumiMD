'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ActionFormValues = {
  description: string;
  notes: string;
  dueAt: string | null;
  visitId: string | null;
};

type ActionDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<ActionFormValues>;
  onSubmit: (values: ActionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  visitOptions: Array<{ id: string; label: string }>;
};

const DEFAULT_FORM: ActionFormValues = {
  description: '',
  notes: '',
  dueAt: null,
  visitId: null,
};

export function ActionDialog({
  open,
  mode,
  onOpenChange,
  initialValues,
  onSubmit,
  isSubmitting,
  visitOptions,
}: ActionDialogProps) {
  const mergedInitialValues = useMemo(
    () => ({
      ...DEFAULT_FORM,
      ...initialValues,
    }),
    [initialValues],
  );

  const [form, setForm] = useState<ActionFormValues>(mergedInitialValues);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        ...DEFAULT_FORM,
        ...initialValues,
      });
      setError(null);
    }
  }, [initialValues, open]);

  const updateField = <K extends keyof ActionFormValues>(
    key: K,
    value: ActionFormValues[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const description = form.description.trim();
    if (!description) {
      setError('Description is required.');
      return;
    }

    try {
      await onSubmit({
        ...form,
        description,
        notes: form.notes.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save action item.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add action item' : 'Edit action item'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Document a follow-up recommendation, reminder, or task from your visit.'
              : 'Update the action item details.'}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <Field label="Description" required>
            <Input
              placeholder="Schedule follow-up with cardiologist"
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              required
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Due date">
              <Input
                type="date"
                value={form.dueAt ?? ''}
                onChange={(event) =>
                  updateField('dueAt', event.target.value || null)
                }
              />
            </Field>
            <Field label="Link to visit">
              <Select
                value={form.visitId ?? 'none'}
                onValueChange={(value) =>
                  updateField('visitId', value === 'none' ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select visit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked visit</SelectItem>
                  {visitOptions.map((visit) => (
                    <SelectItem key={visit.id} value={visit.id}>
                      {visit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              rows={3}
              placeholder="Add helpful context, contact details, or instructions."
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
            />
          </Field>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? mode === 'create'
                  ? 'Adding…'
                  : 'Saving…'
                : mode === 'create'
                  ? 'Add action item'
                  : 'Save changes'}
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
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted-foreground">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}

