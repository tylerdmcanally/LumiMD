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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export type MedicationFormValues = {
  name: string;
  dose: string;
  frequency: string;
  notes: string;
  active: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
};

type MedicationDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<MedicationFormValues>;
  onSubmit: (values: MedicationFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
};

const DEFAULT_VALUES: MedicationFormValues = {
  name: '',
  dose: '',
  frequency: '',
  notes: '',
  active: true,
  startedAt: null,
  stoppedAt: null,
};

export function MedicationDialog({
  open,
  mode,
  onOpenChange,
  initialValues,
  onSubmit,
  isSubmitting,
}: MedicationDialogProps) {
  const mergedInitialValues = useMemo(
    () => ({
      ...DEFAULT_VALUES,
      ...initialValues,
    }),
    [initialValues],
  );

  const [form, setForm] = useState<MedicationFormValues>(mergedInitialValues);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        ...DEFAULT_VALUES,
        ...initialValues,
      });
      setError(null);
    }
  }, [initialValues, open]);

  const handleChange = <K extends keyof MedicationFormValues>(
    key: K,
    value: MedicationFormValues[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Medication name is required.');
      return;
    }

    if (form.stoppedAt && form.startedAt && form.stoppedAt < form.startedAt) {
      setError('Stop date cannot be before the start date.');
      return;
    }

    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        dose: form.dose.trim(),
        frequency: form.frequency.trim(),
        notes: form.notes.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save medication.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add medication' : 'Edit medication'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Track a medication manually. You can update it anytime and it will sync to the mobile app.'
              : 'Update the medication information. Changes will sync to all devices.'}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(event) => handleChange('name', event.target.value)}
                placeholder="Metformin"
                required
              />
            </Field>
            <Field label="Dose">
              <Input
                value={form.dose}
                onChange={(event) => handleChange('dose', event.target.value)}
                placeholder="500 mg"
              />
            </Field>
            <Field label="Frequency">
              <Input
                value={form.frequency}
                onChange={(event) =>
                  handleChange('frequency', event.target.value)
                }
                placeholder="Twice daily"
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.active ? 'active' : 'stopped'}
                onValueChange={(value) =>
                  handleChange('active', value === 'active')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="stopped">Stopped</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start date">
              <Input
                type="date"
                value={form.startedAt ?? ''}
                onChange={(event) =>
                  handleChange('startedAt', event.target.value || null)
                }
              />
            </Field>
            <Field label="Stop date">
              <Input
                type="date"
                value={form.stoppedAt ?? ''}
                onChange={(event) =>
                  handleChange('stoppedAt', event.target.value || null)
                }
                disabled={form.active}
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              rows={3}
              value={form.notes}
              placeholder="Include instructions, allergy checks, or reasons for changes."
              onChange={(event) => handleChange('notes', event.target.value)}
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
                  ? 'Add medication'
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

