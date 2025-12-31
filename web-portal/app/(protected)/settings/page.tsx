'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, User, X, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { doc, setDoc } from 'firebase/firestore';
import { differenceInYears } from 'date-fns';

import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { queryKeys, useUserProfile, usePatientConditions, useUpdateConditionStatus, type PatientCondition } from '@/lib/api/hooks';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { auth, db } from '@/lib/firebase';
import { api } from '@/lib/api/client';

export default function SettingsPage() {
    const router = useRouter();
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
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const allergies = useMemo<string[]>(
        () => (profile?.allergies && Array.isArray(profile.allergies) ? profile.allergies as string[] : []),
        [profile?.allergies],
    );
    const medicalHistory = useMemo<string[]>(
        () =>
            profile?.medicalHistory && Array.isArray(profile.medicalHistory)
                ? profile.medicalHistory as string[]
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
        const parsed = Date.parse(personalInfo.dateOfBirth);
        if (Number.isNaN(parsed)) return null;
        const dob = new Date(parsed);
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

    const exportData = useMutation({
        mutationFn: async () => {
            if (!user?.uid) throw new Error('You need to be signed in to export data.');
            const data = await api.user.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const today = new Date().toISOString().slice(0, 10);
            link.download = `lumimd-export-${today}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        },
        onSuccess: () => {
            toast.success('Export ready. Download started.');
        },
        onError: (error: unknown) => {
            const message =
                error instanceof Error ? error.message : 'Failed to export data. Please try again.';
            toast.error(message);
        },
    });

    const deleteAccount = useMutation({
        mutationFn: async () => {
            if (!user?.uid) throw new Error('You need to be signed in to delete your account.');
            await api.user.deleteAccount();
            await auth.signOut();
        },
        onSuccess: async () => {
            toast.success('Your account has been deleted');
            router.push('/sign-in');
        },
        onError: (error: unknown) => {
            const message =
                error instanceof Error ? error.message : 'Failed to delete account. Please try again.';
            toast.error(message);
        },
        onSettled: () => {
            setDeleteDialogOpen(false);
            setDeleteConfirmText('');
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
                    title="Settings"
                    subtitle="Manage your personal information, health details, and account preferences."
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

                {/* Personal Information */}
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
                                    <Label htmlFor="settings-preferred-name">Preferred name</Label>
                                    <Input
                                        id="settings-preferred-name"
                                        placeholder="How should we address you?"
                                        value={personalInfo.preferredName}
                                        onChange={handlePersonalInfoFieldChange('preferredName')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="settings-date-of-birth">Date of birth</Label>
                                    <Input
                                        id="settings-date-of-birth"
                                        type="date"
                                        value={personalInfo.dateOfBirth}
                                        onChange={handlePersonalInfoFieldChange('dateOfBirth')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="settings-age">Age</Label>
                                    <div className="flex h-11 items-center rounded-lg border border-border-light bg-background-subtle px-3 text-sm font-medium text-text-primary">
                                        {computedAge !== null ? `${computedAge} years` : 'Add your birth date'}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="settings-gender">Gender</Label>
                                    <Input
                                        id="settings-gender"
                                        placeholder="e.g. Female"
                                        value={personalInfo.gender}
                                        onChange={handlePersonalInfoFieldChange('gender')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="settings-primary-physician">Primary physician</Label>
                                    <Input
                                        id="settings-primary-physician"
                                        placeholder="Dr. Johnson"
                                        value={personalInfo.primaryPhysician}
                                        onChange={handlePersonalInfoFieldChange('primaryPhysician')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="settings-emergency-contact-name">Emergency contact name</Label>
                                    <Input
                                        id="settings-emergency-contact-name"
                                        placeholder="Who should we reach out to?"
                                        value={personalInfo.emergencyContactName}
                                        onChange={handlePersonalInfoFieldChange('emergencyContactName')}
                                    />
                                </div>
                                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                                    <Label htmlFor="settings-emergency-contact-phone">Emergency contact phone</Label>
                                    <Input
                                        id="settings-emergency-contact-phone"
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

                {/* AI-Detected Conditions */}
                <AIDetectedConditionsCard />

                {/* Medical History */}
                <Card variant="elevated" padding="lg" className="space-y-6">
                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-text-primary">Medical history</h2>
                        <p className="text-sm text-text-secondary">
                            Record chronic conditions, surgeries, and other past medical events so they're easy to
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

                {/* Drug Allergies & Sensitivities */}
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

                {/* Data & Privacy - at bottom */}
                <Card variant="elevated" padding="lg" className="space-y-6">
                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-text-primary">Data & Privacy</h2>
                        <p className="text-sm text-text-secondary">
                            Export your data or delete your account at any time. Deleting your account is
                            permanent and removes visits, medications, actions, and caregiver shares.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                            variant="secondary"
                            leftIcon={<Download className="h-4 w-4" />}
                            onClick={() => exportData.mutate()}
                            loading={exportData.isPending}
                            className="w-full sm:w-auto"
                        >
                            Export my data
                        </Button>
                        <Button
                            variant="danger"
                            leftIcon={<Trash2 className="h-4 w-4" />}
                            onClick={() => setDeleteDialogOpen(true)}
                            className="w-full sm:w-auto"
                        >
                            Delete account
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-4 pt-4 border-t border-border-light text-sm">
                        <a
                            href="/privacy"
                            className="text-brand-primary hover:underline"
                        >
                            Privacy Policy
                        </a>
                        <a
                            href="/terms"
                            className="text-brand-primary hover:underline"
                        >
                            Terms of Service
                        </a>
                    </div>
                </Card>
            </div>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete your account</DialogTitle>
                        <DialogDescription>
                            This will permanently delete your visits, medications, action items, and caregiver
                            access. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-text-secondary">
                            Type <span className="font-semibold text-text-primary">DELETE</span> to confirm.
                        </p>
                        <Input
                            value={deleteConfirmText}
                            onChange={(event) => setDeleteConfirmText(event.target.value)}
                            placeholder="DELETE"
                        />
                    </div>
                    <DialogFooter className="gap-3 sm:justify-between">
                        <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)} disabled={deleteAccount.isPending}>
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => deleteAccount.mutate()}
                            loading={deleteAccount.isPending}
                            disabled={deleteConfirmText.trim() !== 'DELETE'}
                        >
                            Delete my account
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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

function AIDetectedConditionsCard() {
    const { data: conditions = [], isLoading } = usePatientConditions();
    const updateStatus = useUpdateConditionStatus();

    const handleStatusChange = (conditionId: string, newStatus: 'active' | 'resolved' | 'monitoring') => {
        updateStatus.mutate({ conditionId, status: newStatus });
    };

    const statusColors = {
        active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        resolved: 'bg-gray-100 text-gray-600 border-gray-200',
        monitoring: 'bg-amber-100 text-amber-700 border-amber-200',
    };

    if (isLoading) {
        return (
            <Card variant="elevated" padding="lg" className="space-y-6">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-48 rounded-lg bg-brand-primary/10" />
                    <Skeleton className="h-4 w-96 rounded-lg bg-brand-primary/10" />
                </div>
                <Skeleton className="h-16 w-full rounded-lg bg-brand-primary/10" />
            </Card>
        );
    }

    if (conditions.length === 0) {
        return null; // Don't show card if no AI-detected conditions
    }

    return (
        <Card variant="elevated" padding="lg" className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold text-text-primary">AI-Detected Conditions</h2>
                <p className="text-sm text-text-secondary">
                    Conditions identified from your visit summaries. Mark as resolved or incorrect if no longer applicable.
                </p>
            </div>

            <div className="space-y-3">
                {conditions.map((condition) => (
                    <div
                        key={condition.id}
                        className="flex flex-col gap-2 rounded-xl border border-border-light bg-background-subtle/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="flex-1">
                            <p className={cn(
                                'font-medium text-text-primary',
                                condition.status === 'resolved' && 'line-through text-text-muted'
                            )}>
                                {condition.name}
                            </p>
                            {condition.diagnosedAt && (
                                <p className="text-sm text-text-muted">
                                    Since {new Date(condition.diagnosedAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                        <select
                            value={condition.status}
                            onChange={(e) => handleStatusChange(condition.id, e.target.value as 'active' | 'resolved' | 'monitoring')}
                            disabled={updateStatus.isPending}
                            className={cn(
                                'rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer',
                                statusColors[condition.status],
                                updateStatus.isPending && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <option value="active">🟢 Active</option>
                            <option value="resolved">⚪ Resolved</option>
                            <option value="monitoring">🟡 Monitoring</option>
                        </select>
                    </div>
                ))}
            </div>

            <p className="text-sm text-text-muted">
                Marking a condition as resolved or monitoring helps LumiBot provide more relevant nudges.
            </p>
        </Card>
    );
}
