'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, User } from 'lucide-react';
import { toast } from 'sonner';
import { doc, setDoc } from 'firebase/firestore';
import { differenceInYears } from 'date-fns';

import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys, useUserProfile } from '@/lib/api/hooks';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';

export default function ProfilePage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useUserProfile(user?.uid);
  const [newAllergy, setNewAllergy] = useState('');
  const [newMedicalHistory, setNewMedicalHistory] = useState('');
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

  return (
    <PageContainer maxWidth="lg">
      <div className="space-y-8">
        <PageHeader
          title="Profile"
          subtitle="Maintain allergy and safety information so LumiMD can flag potential issues."
          actions={
            user?.email ? (
              <div className="hidden items-center gap-2 rounded-full border border-border-light bg-background-subtle px-4 py-2 text-sm text-text-secondary md:flex">
                <User className="h-4 w-4 text-brand-primary" />
                <span className="font-medium text-text-primary">{user.email}</span>
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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                <div className="space-y-2 md:col-span-1 lg:col-span-1">
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

              <div className="flex flex-col gap-3 border-t border-border-light pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-secondary">
                  These details stay private to you and help us tailor visit summaries and alerts.
                </p>
                <Button type="submit" variant="primary" loading={updatePersonalInfo.isPending}>
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
                className="flex flex-col gap-4 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex-1">
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
        className="flex flex-col gap-4 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:gap-3"
      >
                <div className="flex-1">
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
            'group inline-flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary-pale px-4 py-2 text-sm font-semibold text-brand-primary transition-smooth',
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

