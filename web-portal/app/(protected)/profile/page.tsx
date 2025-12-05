'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Folder, Pencil, Plus, Trash2, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { doc, setDoc } from 'firebase/firestore';
import { differenceInYears } from 'date-fns';

import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { queryKeys, useUserProfile, useVisits } from '@/lib/api/hooks';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { CaregiverSettings } from '@/components/CaregiverSettings';

export default function ProfilePage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useUserProfile(user?.uid);
  const [newAllergy, setNewAllergy] = useState('');
  const [newMedicalHistory, setNewMedicalHistory] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = useState('');
  const [personalInfo, setPersonalInfo] = useState({
    preferredName: '',
    dateOfBirth: '',
    gender: '',
    primaryPhysician: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const allergies = useMemo(
    () => (profile?.allergies && Array.isArray(profile.allergies) ? profile.allergies : []),
    [profile?.allergies],
  );
  const medicalHistory = useMemo(
    () =>
      profile?.medicalHistory && Array.isArray(profile.medicalHistory)
        ? profile.medicalHistory
        : [],
    [profile?.medicalHistory],
  );
  const folders = useMemo(
    () =>
      profile?.folders && Array.isArray(profile.folders)
        ? (profile.folders as unknown[])
            .map((folder: unknown) => (typeof folder === 'string' ? folder.trim() : ''))
            .filter((folder: string) => folder.length > 0)
        : [],
    [profile?.folders],
  );
  const { data: visits = [], isLoading: visitsLoading } = useVisits(user?.uid);
  const folderUsage = useMemo(() => {
    const usage = new Map<string, number>();
    if (!Array.isArray(visits)) {
      return usage;
    }

    visits.forEach((visit) => {
      if (!visit || !Array.isArray(visit.folders)) {
        return;
      }
      (visit.folders as unknown[]).forEach((folder: unknown) => {
        if (typeof folder !== 'string') return;
        const trimmed = folder.trim();
        if (!trimmed) return;
        usage.set(trimmed, (usage.get(trimmed) ?? 0) + 1);
      });
    });

    return usage;
  }, [visits]);
  const isFoldersLoading = isLoading || visitsLoading;

  useEffect(() => {
    if (!profile) return;
    setPersonalInfo({
      preferredName: typeof profile.preferredName === 'string' ? profile.preferredName : '',
      dateOfBirth: typeof profile.dateOfBirth === 'string' ? profile.dateOfBirth : '',
      gender: typeof profile.gender === 'string' ? profile.gender : '',
      primaryPhysician:
        typeof profile.primaryPhysician === 'string' ? profile.primaryPhysician : '',
      emergencyContactName:
        typeof profile.emergencyContactName === 'string' ? profile.emergencyContactName : '',
      emergencyContactPhone:
        typeof profile.emergencyContactPhone === 'string' ? profile.emergencyContactPhone : '',
    });
  }, [profile]);

  const computedAge = useMemo(() => {
    if (!personalInfo.dateOfBirth) return null;
    const dob = new Date(personalInfo.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    const age = differenceInYears(new Date(), dob);
    return Number.isFinite(age) && age >= 0 ? age : null;
  }, [personalInfo.dateOfBirth]);

  const updateAllergies = useMutation({
    mutationFn: async (payload: { allergies: string[] }) => {
      if (!user?.uid) {
        throw new Error('You need to be signed in to update your profile.');
      }
      const ref = doc(db, 'users', user.uid);
      await setDoc(ref, { allergies: payload.allergies }, { merge: true });
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userProfile(user.uid),
        });
      }
      toast.success('Allergies updated');
      setNewAllergy('');
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update allergies. Please try again.';
      toast.error(message);
    },
  });
  const updateMedicalHistory = useMutation({
    mutationFn: async (payload: { medicalHistory: string[] }) => {
      if (!user?.uid) {
        throw new Error('You need to be signed in to update your profile.');
      }
      const ref = doc(db, 'users', user.uid);
      await setDoc(ref, { medicalHistory: payload.medicalHistory }, { merge: true });
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userProfile(user.uid),
        });
      }
      toast.success('Medical history updated');
      setNewMedicalHistory('');
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update medical history. Please try again.';
      toast.error(message);
    },
  });
  const updateFolders = useMutation({
    mutationFn: async (payload: { folders: string[] }) => {
      if (!user?.uid) {
        throw new Error('You need to be signed in to update your profile.');
      }
      const ref = doc(db, 'users', user.uid);
      const sanitizedFolders = Array.from(
        new Set(
          (payload.folders || [])
            .map((folder) => (typeof folder === 'string' ? folder.trim() : ''))
            .filter((folder) => folder.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b));
      await setDoc(ref, { folders: sanitizedFolders }, { merge: true });
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userProfile(user.uid),
        });
      }
      toast.success('Folders updated');
      setNewFolderName('');
      setEditingFolder(null);
      setEditingFolderValue('');
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update folders. Please try again.';
      toast.error(message);
    },
  });
  const updatePersonalInfo = useMutation({
    mutationFn: async (
      payload: Partial<{
        preferredName: string | null;
        dateOfBirth: string | null;
        gender: string | null;
        primaryPhysician: string | null;
        emergencyContactName: string | null;
        emergencyContactPhone: string | null;
      }>,
    ) => {
      if (!user?.uid) {
        throw new Error('You need to be signed in to update your profile.');
      }

      const sanitizedEntries = Object.entries(payload).reduce(
        (acc, [key, value]) => {
          if (value === undefined) return acc;
          if (typeof value === 'string') {
            const trimmed = value.trim();
            acc[key] = trimmed.length > 0 ? trimmed : null;
          } else {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string | null>,
      );

      const ref = doc(db, 'users', user.uid);
      await setDoc(ref, sanitizedEntries, { merge: true });
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userProfile(user.uid),
        });
      }
      toast.success('Profile updated');
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to update profile. Please try again.';
      toast.error(message);
    },
  });

  const handleAddAllergy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newAllergy.trim();
    if (!trimmed) return;
    if (allergies.includes(trimmed)) {
      toast.info('That allergy is already listed.');
      return;
    }
    updateAllergies.mutate({ allergies: [...allergies, trimmed] });
  };

  const handleRemoveAllergy = (value: string) => {
    const next = allergies.filter((item) => item !== value);
    updateAllergies.mutate({ allergies: next });
  };

  const handleAddMedicalHistory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newMedicalHistory.trim();
    if (!trimmed) return;
    if (medicalHistory.includes(trimmed)) {
      toast.info('That condition is already listed.');
      return;
    }
    updateMedicalHistory.mutate({ medicalHistory: [...medicalHistory, trimmed] });
  };

  const handleRemoveMedicalHistory = (value: string) => {
    const next = medicalHistory.filter((item) => item !== value);
    updateMedicalHistory.mutate({ medicalHistory: next });
  };

  const handlePersonalInfoFieldChange =
    (field: keyof typeof personalInfo) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setPersonalInfo((prev) => ({
        ...prev,
        [field]: value,
      }));
    };

  const handlePersonalInfoSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updatePersonalInfo.mutate({
      preferredName: personalInfo.preferredName,
      dateOfBirth: personalInfo.dateOfBirth,
      gender: personalInfo.gender,
      primaryPhysician: personalInfo.primaryPhysician,
      emergencyContactName: personalInfo.emergencyContactName,
      emergencyContactPhone: personalInfo.emergencyContactPhone,
    });
  };

  const handleAddFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (updateFolders.isPending) return;
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    const existing = new Set(folders.map((folder) => folder.toLowerCase()));
    if (existing.has(normalized)) {
      toast.info('That folder already exists.');
      setNewFolderName('');
      return;
    }
    updateFolders.mutate({ folders: [...folders, trimmed] });
  };

  const handleStartRenameFolder = (folder: string) => {
    if (updateFolders.isPending) return;
    setEditingFolder(folder);
    setEditingFolderValue(folder);
  };

  const handleCancelRenameFolder = () => {
    if (updateFolders.isPending) return;
    setEditingFolder(null);
    setEditingFolderValue('');
  };

  const handleSaveRenameFolder = (folder: string) => {
    if (!editingFolder) return;
    if (folder !== editingFolder) {
      handleStartRenameFolder(folder);
      return;
    }
    const trimmed = editingFolderValue.trim();
    if (!trimmed) {
      toast.info('Folder name cannot be empty.');
      return;
    }
    if (trimmed === folder) {
      handleCancelRenameFolder();
      return;
    }
    const normalized = trimmed.toLowerCase();
    const existing = new Set(
      folders.filter((item) => item !== folder).map((item) => item.toLowerCase()),
    );
    if (existing.has(normalized)) {
      toast.info('A folder with that name already exists.');
      return;
    }
    updateFolders.mutate({
      folders: folders.map((item) => (item === folder ? trimmed : item)),
    });
  };

  const handleDeleteFolder = (folder: string) => {
    if (updateFolders.isPending) return;
    const usageCount = folderUsage.get(folder) ?? 0;
    if (
      usageCount > 0 &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `"${folder}" is linked to ${usageCount} visit${usageCount === 1 ? '' : 's'}. Removing it won't change existing visits. Continue?`,
      )
    ) {
      return;
    }
    updateFolders.mutate({
      folders: folders.filter((item) => item !== folder),
    });
  };

  return (
    <PageContainer maxWidth="lg">
      <div className="space-y-8">
        <PageHeader
          title="Profile"
          subtitle="Maintain allergy and safety information so LumiMD can flag potential issues."
          actions={
            user?.email ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-background-subtle px-4 py-2 text-sm text-text-secondary">
                <User className="h-4 w-4 text-brand-primary" />
                <span className="font-medium text-text-primary truncate max-w-[200px] sm:max-w-none">
                  {user.email}
                </span>
              </div>
            ) : undefined
          }
        />

        <Card variant="elevated" padding="lg" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Personal information</h2>
            <p className="text-sm text-text-secondary">
              Keep your core details up to date so LumiMD can provide the right context for your
              care team.
            </p>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handlePersonalInfoSubmit}>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="profile-preferred-name">Preferred name</Label>
                  <Input
                    id="profile-preferred-name"
                    placeholder="How should we address you?"
                    value={personalInfo.preferredName}
                    onChange={handlePersonalInfoFieldChange('preferredName')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-date-of-birth">Date of birth</Label>
                  <Input
                    id="profile-date-of-birth"
                    type="date"
                    value={personalInfo.dateOfBirth}
                    onChange={handlePersonalInfoFieldChange('dateOfBirth')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-age">Age</Label>
                  <div className="flex h-11 items-center rounded-lg border border-border-light bg-background-subtle px-3 text-sm font-medium text-text-primary">
                    {computedAge !== null ? `${computedAge} years` : 'Add your birth date'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-gender">Gender</Label>
                  <Input
                    id="profile-gender"
                    placeholder="e.g. Female"
                    value={personalInfo.gender}
                    onChange={handlePersonalInfoFieldChange('gender')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-primary-physician">Primary physician</Label>
                  <Input
                    id="profile-primary-physician"
                    placeholder="Dr. Johnson"
                    value={personalInfo.primaryPhysician}
                    onChange={handlePersonalInfoFieldChange('primaryPhysician')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-emergency-contact-name">Emergency contact name</Label>
                  <Input
                    id="profile-emergency-contact-name"
                    placeholder="Who should we reach out to?"
                    value={personalInfo.emergencyContactName}
                    onChange={handlePersonalInfoFieldChange('emergencyContactName')}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="profile-emergency-contact-phone">Emergency contact phone</Label>
                  <Input
                    id="profile-emergency-contact-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={personalInfo.emergencyContactPhone}
                    onChange={handlePersonalInfoFieldChange('emergencyContactPhone')}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 border-t border-border-light pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-secondary">
                  These details stay private to you and help us tailor visit summaries and alerts.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  loading={updatePersonalInfo.isPending}
                  className="w-full sm:w-auto"
                >
                  Save personal info
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card variant="elevated" padding="lg" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Medical history</h2>
            <p className="text-sm text-text-secondary">
              Record chronic conditions, surgeries, and other past medical events so they’re easy to
              reference during visits.
            </p>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-64 rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-56 rounded-lg bg-brand-primary/10" />
            </div>
          ) : (
            <>
              <RemovableChipList
                items={medicalHistory}
                isMutating={updateMedicalHistory.isPending}
                onRemove={handleRemoveMedicalHistory}
                emptyMessage="No medical history recorded yet. Add key conditions, surgeries, or diagnoses you want at your fingertips."
                removeLabel="Remove condition"
              />

              <form
                onSubmit={handleAddMedicalHistory}
                className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex-1 w-full">
                  <Input
                    placeholder="Add a condition (e.g. Hypertension)"
                    value={newMedicalHistory}
                    onChange={(event) => setNewMedicalHistory(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={<Plus className="h-4 w-4" />}
                  loading={updateMedicalHistory.isPending}
                  className="w-full sm:w-auto"
                >
                  Add condition
                </Button>
              </form>
            </>
          )}

          <p className="text-sm text-text-muted">
            These details are private to you and help LumiMD tailor visit summaries and action items
            with the right context.
          </p>
        </Card>

        <Card variant="elevated" padding="lg" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Visit folders & shortcuts</h2>
            <p className="text-sm text-text-secondary">
              Curate the folder list that powers visit filters, suggestions, and quick organization for every visit.
            </p>
          </div>

          {isFoldersLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-48 rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-14 w-full rounded-xl bg-brand-primary/10" />
              <Skeleton className="h-14 w-full rounded-xl bg-brand-primary/10" />
            </div>
          ) : (
            <>
              <FolderManagerList
                folders={folders}
                folderUsage={folderUsage}
                editingFolder={editingFolder}
                editingValue={editingFolderValue}
                isMutating={updateFolders.isPending}
                onStartRename={handleStartRenameFolder}
                onCancelRename={handleCancelRenameFolder}
                onChangeEditingValue={setEditingFolderValue}
                onSaveRename={handleSaveRenameFolder}
                onDelete={handleDeleteFolder}
              />

              <form
                onSubmit={handleAddFolder}
                className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex-1 w-full">
                  <Input
                    placeholder="Add a folder (e.g. Oncology)"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    disabled={updateFolders.isPending}
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={<Plus className="h-4 w-4" />}
                  loading={updateFolders.isPending}
                  className="w-full sm:w-auto"
                >
                  Add folder
                </Button>
              </form>
            </>
          )}

          <p className="text-sm text-text-muted">
            Changes sync instantly across your visits. Removing a folder keeps existing visits untouched, but the folder will no longer be suggested elsewhere.
          </p>
        </Card>

        <Card variant="elevated" padding="lg" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text-primary">Drug allergies & sensitivities</h2>
            <p className="text-sm text-text-secondary">
              Keep this list up to date so LumiMD can warn you about potential conflicts in visit summaries and action items.
            </p>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-48 rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-full rounded-lg bg-brand-primary/10" />
              <Skeleton className="h-11 w-56 rounded-lg bg-brand-primary/10" />
            </div>
          ) : (
            <>
              <RemovableChipList
                items={allergies}
                isMutating={updateAllergies.isPending}
                onRemove={handleRemoveAllergy}
                emptyMessage="No allergies recorded yet. Add any medications or substances you want LumiMD to watch out for."
                removeLabel="Remove allergy"
              />

              <form
                onSubmit={handleAddAllergy}
                className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex-1 w-full">
                  <Input
                    placeholder="Add an allergy (e.g. Penicillin)"
                    value={newAllergy}
                    onChange={(event) => setNewAllergy(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={<Plus className="h-4 w-4" />}
                  loading={updateAllergies.isPending}
                  className="w-full sm:w-auto"
                >
                  Add allergy
                </Button>
              </form>
            </>
          )}

          <p className="text-sm text-text-muted">
            This information is private to you and helps LumiMD surface safety alerts when you review visits, medications, and action items.
          </p>
        </Card>

        <Card variant="elevated" padding="lg" className="space-y-6">
          <CaregiverSettings />
        </Card>
      </div>
    </PageContainer>
  );
}

function RemovableChipList({
  items,
  isMutating,
  onRemove,
  emptyMessage,
  removeLabel = 'Remove item',
}: {
  items: string[];
  isMutating?: boolean;
  onRemove: (value: string) => void;
  emptyMessage: string;
  removeLabel?: string;
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-background-subtle/70 p-6 text-sm text-text-secondary">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={isMutating}
          onClick={() => onRemove(item)}
          title={removeLabel}
          aria-label={`${removeLabel}: ${item}`}
          className={cn(
            'group inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary-pale px-4 py-2.5 text-sm font-semibold text-brand-primary transition-smooth',
            isMutating && 'cursor-not-allowed opacity-70',
          )}
        >
          <span>{item}</span>
          <X className="h-4 w-4 transition-smooth group-hover:scale-110" />
        </button>
      ))}
    </div>
  );
}

type FolderManagerListProps = {
  folders: string[];
  folderUsage: Map<string, number>;
  editingFolder: string | null;
  editingValue: string;
  isMutating: boolean;
  onStartRename: (folder: string) => void;
  onCancelRename: () => void;
  onChangeEditingValue: (value: string) => void;
  onSaveRename: (folder: string) => void;
  onDelete: (folder: string) => void;
};

function FolderManagerList({
  folders,
  folderUsage,
  editingFolder,
  editingValue,
  isMutating,
  onStartRename,
  onCancelRename,
  onChangeEditingValue,
  onSaveRename,
  onDelete,
}: FolderManagerListProps) {
  if (!folders.length) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-background-subtle/70 p-6 text-sm text-text-secondary">
        You haven’t added any visit folders yet. Create folders like “Primary Care”, “Specialists”, or “Follow-ups” to speed up organization later.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {folders.map((folder) => {
        const usageCount = folderUsage.get(folder) ?? 0;
        const isEditing = editingFolder === folder;

        return (
          <div
            key={folder}
            className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-1 flex-col gap-2">
              {isEditing ? (
                <Input
                  value={editingValue}
                  onChange={(event) => onChangeEditingValue(event.target.value)}
                  autoFocus
                  disabled={isMutating}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    size="sm"
                    tone="neutral"
                    variant="soft"
                    className="bg-background-subtle text-text-primary"
                    leftIcon={<Folder className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />}
                  >
                    {folder}
                  </Badge>
                  <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    {usageCount === 0
                      ? 'Unused'
                      : `${usageCount} visit${usageCount === 1 ? '' : 's'}`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => onSaveRename(folder)}
                    loading={isMutating}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancelRename}
                    disabled={isMutating}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onStartRename(folder)}
                    disabled={isMutating}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-error hover:text-error focus-visible:ring-error"
                    onClick={() => onDelete(folder)}
                    disabled={isMutating}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

