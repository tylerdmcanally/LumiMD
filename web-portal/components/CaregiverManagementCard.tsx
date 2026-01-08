'use client';

/**
 * CaregiverManagementCard
 * 
 * Component for managing caregivers who receive automatic visit PDF shares.
 * Different from CaregiverSettings.tsx which handles portal access sharing.
 */

import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, Users, Mail, User2, ToggleLeft, ToggleRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Caregiver {
    id: string;
    name: string;
    email: string;
    relationship?: string;
    status: 'pending' | 'active' | 'paused';
    addedAt?: string;
}

const RELATIONSHIPS = [
    'Parent',
    'Spouse/Partner',
    'Child',
    'Sibling',
    'Aide',
    'Other',
];

export function CaregiverManagementCard() {
    const queryClient = useQueryClient();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newCaregiver, setNewCaregiver] = useState({
        name: '',
        email: '',
        relationship: '',
    });
    const [emailError, setEmailError] = useState<string | null>(null);

    // Fetch caregivers
    const { data, isLoading } = useQuery({
        queryKey: ['caregivers'],
        queryFn: async () => {
            const response = await api.user.listCaregivers();
            return response;
        },
    });

    const caregivers = (data?.caregivers || []) as Caregiver[];
    const autoShareEnabled = data?.autoShareWithCaregivers || false;

    // Add caregiver mutation
    const addCaregiverMutation = useMutation({
        mutationFn: async (payload: { name: string; email: string; relationship?: string }) => {
            return api.user.addCaregiver(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['caregivers'] });
            toast.success('Caregiver added');
            setIsAddDialogOpen(false);
            setNewCaregiver({ name: '', email: '', relationship: '' });
            setEmailError(null);
        },
        onError: (error: any) => {
            const message = error?.userMessage || error?.message || 'Failed to add caregiver';
            if (message.includes('already exists') || message.includes('duplicate')) {
                setEmailError('This email is already added');
            } else {
                toast.error(message);
            }
        },
    });

    // Delete caregiver mutation
    const deleteCaregiverMutation = useMutation({
        mutationFn: async (id: string) => {
            return api.user.deleteCaregiver(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['caregivers'] });
            toast.success('Caregiver removed');
        },
        onError: (error: any) => {
            const message = error?.userMessage || error?.message || 'Failed to remove caregiver';
            toast.error(message);
        },
    });

    // Toggle auto-share mutation
    const toggleAutoShareMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            return api.user.updateProfile({ autoShareWithCaregivers: enabled });
        },
        onSuccess: (_, enabled) => {
            queryClient.invalidateQueries({ queryKey: ['caregivers'] });
            toast.success(enabled ? 'Auto-share enabled' : 'Auto-share disabled');
        },
        onError: (error: any) => {
            const message = error?.userMessage || error?.message || 'Failed to update setting';
            toast.error(message);
        },
    });

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const handleAddCaregiver = () => {
        if (!newCaregiver.name.trim() || !newCaregiver.email.trim()) return;

        if (!validateEmail(newCaregiver.email.trim())) {
            setEmailError('Please enter a valid email address');
            return;
        }

        addCaregiverMutation.mutate({
            name: newCaregiver.name.trim(),
            email: newCaregiver.email.trim().toLowerCase(),
            relationship: newCaregiver.relationship || undefined,
        });
    };

    if (isLoading) {
        return (
            <Card variant="elevated" padding="lg" className="space-y-6">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-48 rounded-lg bg-brand-primary/10" />
                    <Skeleton className="h-4 w-96 rounded-lg bg-brand-primary/10" />
                </div>
                <Skeleton className="h-20 w-full rounded-lg bg-brand-primary/10" />
            </Card>
        );
    }

    return (
        <>
            <Card variant="elevated" padding="lg" className="space-y-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-brand-primary" />
                        <h2 className="text-xl font-semibold text-text-primary">
                            Visit Summary Sharing
                        </h2>
                    </div>
                    <p className="text-sm text-text-secondary">
                        Add caregivers to automatically receive email summaries after your doctor visits.
                        They'll get a PDF with the key takeaways so they can stay informed.
                    </p>
                </div>

                {/* Auto-share toggle */}
                <div className="flex items-center justify-between rounded-xl border border-border-light bg-background-subtle/60 p-4">
                    <div className="space-y-1">
                        <p className="font-medium text-text-primary">Automatic sharing</p>
                        <p className="text-sm text-text-muted">
                            Automatically send visit summaries to all caregivers when processing completes
                        </p>
                    </div>
                    <button
                        onClick={() => toggleAutoShareMutation.mutate(!autoShareEnabled)}
                        disabled={toggleAutoShareMutation.isPending || caregivers.length === 0}
                        className={cn(
                            'transition-colors',
                            caregivers.length === 0 && 'opacity-50 cursor-not-allowed'
                        )}
                        title={caregivers.length === 0 ? 'Add caregivers first' : undefined}
                    >
                        {autoShareEnabled ? (
                            <ToggleRight className="h-8 w-8 text-brand-primary" />
                        ) : (
                            <ToggleLeft className="h-8 w-8 text-text-muted" />
                        )}
                    </button>
                </div>

                {/* Caregiver list */}
                {caregivers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-background-subtle/70 p-6 text-center">
                        <Users className="mx-auto h-8 w-8 text-text-muted mb-3" />
                        <p className="text-sm text-text-secondary">
                            No caregivers added yet. Add a caregiver to start sharing visit summaries automatically.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {caregivers.map((caregiver) => (
                            <div
                                key={caregiver.id}
                                className="flex items-center justify-between rounded-xl border border-border-light bg-background-subtle/60 p-4"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/10">
                                        <User2 className="h-5 w-5 text-brand-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-text-primary">
                                            {caregiver.name}
                                        </p>
                                        <div className="flex items-center gap-2 text-sm text-text-muted">
                                            <Mail className="h-3.5 w-3.5" />
                                            <span>{caregiver.email}</span>
                                            {caregiver.relationship && (
                                                <>
                                                    <span>•</span>
                                                    <span>{caregiver.relationship}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteCaregiverMutation.mutate(caregiver.id)}
                                    loading={deleteCaregiverMutation.isPending}
                                    className="text-text-muted hover:text-status-error"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add button */}
                <Button
                    variant="secondary"
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => setIsAddDialogOpen(true)}
                    disabled={caregivers.length >= 5}
                    className="w-full sm:w-auto"
                >
                    {caregivers.length >= 5 ? 'Maximum caregivers reached' : 'Add caregiver'}
                </Button>

                <p className="text-sm text-text-muted">
                    Caregivers will receive an email with access instructions when added.
                    You can have up to 5 caregivers.
                </p>
            </Card>

            {/* Add Caregiver Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a caregiver</DialogTitle>
                        <DialogDescription>
                            This person will receive email summaries of your visits. They can also
                            create an account to view your full visit history.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="caregiver-name">Name</Label>
                            <Input
                                id="caregiver-name"
                                placeholder="e.g., Mom, Dr. Smith"
                                value={newCaregiver.name}
                                onChange={(e) => setNewCaregiver(prev => ({
                                    ...prev,
                                    name: e.target.value
                                }))}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="caregiver-email">Email address</Label>
                            <Input
                                id="caregiver-email"
                                type="email"
                                placeholder="caregiver@email.com"
                                value={newCaregiver.email}
                                onChange={(e) => {
                                    setNewCaregiver(prev => ({
                                        ...prev,
                                        email: e.target.value
                                    }));
                                    setEmailError(null);
                                }}
                                className={emailError ? 'border-status-error' : ''}
                            />
                            {emailError && (
                                <p className="text-sm text-status-error">{emailError}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="caregiver-relationship">
                                Relationship <span className="text-text-muted">(optional)</span>
                            </Label>
                            <select
                                id="caregiver-relationship"
                                value={newCaregiver.relationship}
                                onChange={(e) => setNewCaregiver(prev => ({
                                    ...prev,
                                    relationship: e.target.value
                                }))}
                                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                            >
                                <option value="">Select relationship</option>
                                {RELATIONSHIPS.map((rel) => (
                                    <option key={rel} value={rel}>{rel}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <DialogFooter className="gap-3 sm:justify-between">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setIsAddDialogOpen(false);
                                setNewCaregiver({ name: '', email: '', relationship: '' });
                                setEmailError(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleAddCaregiver}
                            loading={addCaregiverMutation.isPending}
                            disabled={!newCaregiver.name.trim() || !newCaregiver.email.trim()}
                        >
                            Add caregiver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
