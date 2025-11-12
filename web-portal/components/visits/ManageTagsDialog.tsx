'use client';

import { FormEvent, useMemo, useState } from 'react';

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
import { cn } from '@/lib/utils';
import { Folder, Plus, Sparkles, X } from 'lucide-react';

const DEFAULT_FOLDER_TEMPLATES = [
  'Primary Care',
  'Specialists',
  'Annual Checkups',
  'Diagnostics',
  'Physical Therapy',
  'Telehealth',
];

type ManageTagsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTags: string[];
  initialFolders: string[];
  onSave: (payload: { tags: string[]; folders: string[] }) => Promise<void> | void;
  isSaving?: boolean;
  suggestedFolders?: string[];
  templateFolders?: string[];
};

export function ManageTagsDialog({
  open,
  onOpenChange,
  initialTags,
  initialFolders,
  onSave,
  isSaving,
  suggestedFolders,
  templateFolders,
}: ManageTagsDialogProps) {
  const [tags, setTags] = useState(() => [...initialTags]);
  const [folders, setFolders] = useState(() => [...initialFolders]);
  const [tagInput, setTagInput] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const normalizedFolderSet = useMemo(
    () =>
      new Set(
        folders
          .map((folder) =>
            typeof folder === 'string' ? folder.trim().toLowerCase() : '',
          )
          .filter(Boolean),
      ),
    [folders],
  );

  const profileSuggestions = useMemo(() => {
    if (!suggestedFolders?.length) {
      return [];
    }
    const unique = new Set<string>();
    suggestedFolders.forEach((folder) => {
      if (typeof folder !== 'string') return;
      const trimmed = folder.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (normalizedFolderSet.has(lower)) return;
      unique.add(trimmed);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [suggestedFolders, normalizedFolderSet]);

  const profileSuggestionSet = useMemo(
    () => new Set(profileSuggestions.map((folder) => folder.toLowerCase())),
    [profileSuggestions],
  );

  const quickSuggestions = useMemo(() => {
    const source =
      templateFolders && templateFolders.length > 0
        ? templateFolders
        : DEFAULT_FOLDER_TEMPLATES;

    const unique = new Set<string>();

    source.forEach((folder) => {
      if (typeof folder !== 'string') return;
      const trimmed = folder.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (normalizedFolderSet.has(lower) || profileSuggestionSet.has(lower)) return;
      unique.add(trimmed);
    });

    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [templateFolders, normalizedFolderSet, profileSuggestionSet]);

  const hasFolderSuggestions =
    profileSuggestions.length > 0 || quickSuggestions.length > 0;

  const resetState = () => {
    setTags([...initialTags]);
    setFolders([...initialFolders]);
    setTagInput('');
    setFolderInput('');
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const addFolder = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (normalizedFolderSet.has(lower)) {
      setFolderInput('');
      return;
    }
    setFolders((prev) => [...prev, trimmed]);
    setFolderInput('');
  };

  const removeTag = (value: string) => {
    setTags((prev) => prev.filter((tag) => tag !== value));
  };

  const removeFolder = (value: string) => {
    setFolders((prev) => prev.filter((folder) => folder !== value));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await onSave({
        tags: tags.map((tag) => tag.trim()).filter(Boolean),
        folders: folders.map((folder) => folder.trim()).filter(Boolean),
      });
      handleOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save changes. Try again.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Organize visit</DialogTitle>
          <DialogDescription>
            Add descriptive tags and folders to keep visits grouped by specialty,
            provider, or treatment plan.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <Section
            title="Tags"
            description="Quick filters for search and insights. Examples: “cardiology”, “labs”, “post-op”."
          >
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="Add a tag and press Enter"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag(tagInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => addTag(tagInput)}
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                Add
              </Button>
            </div>
            <ChipList items={tags} onRemove={removeTag} emptyLabel="No tags yet" />
          </Section>

          <Section
            title="Folders"
            description="High-level groupings that show in the visits list. Examples: “Specialists”, “Annual”, “Oncology”."
          >
            <div className="flex gap-2">
              <Input
                value={folderInput}
                onChange={(event) => setFolderInput(event.target.value)}
                placeholder="Add a folder and press Enter"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addFolder(folderInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => addFolder(folderInput)}
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              >
                Add
              </Button>
            </div>
            {hasFolderSuggestions ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-border-light/70 bg-background-subtle/60 p-3">
                <SuggestionGroup
                  title="From your folders"
                  icon={<Folder className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />}
                  suggestions={profileSuggestions}
                  onSelect={addFolder}
                />
                <SuggestionGroup
                  title="Quick picks"
                  icon={<Sparkles className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />}
                  suggestions={quickSuggestions}
                  onSelect={addFolder}
                />
              </div>
            ) : null}
            <ChipList
              items={folders}
              onRemove={removeFolder}
              emptyLabel="No folders yet"
              variant="folder"
            />
          </Section>

          {error ? (
            <p className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ChipList({
  items,
  onRemove,
  emptyLabel,
  variant = 'tag',
}: {
  items: string[];
  onRemove: (value: string) => void;
  emptyLabel: string;
  variant?: 'tag' | 'folder';
}) {
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onRemove(item)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition',
            variant === 'tag'
              ? 'bg-primary/10 text-primary-dark hover:bg-primary/20'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          <span>{item}</span>
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

type SuggestionGroupProps = {
  title: string;
  icon?: React.ReactNode;
  suggestions: string[];
  onSelect: (value: string) => void;
};

function SuggestionGroup({
  title,
  icon,
  suggestions,
  onSelect,
}: SuggestionGroupProps) {
  if (!suggestions.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon ? (
          <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
        ) : null}
        <span>{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-light/80 bg-background-subtle/80 px-3 py-1 text-xs font-semibold text-text-secondary transition-smooth hover:border-brand-primary/60 hover:bg-brand-primary/10 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>{suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

