'use client';

/**
 * Shared Visit Page
 * 
 * Public page for caregivers to view a shared visit summary.
 * No authentication required - accessed via email link.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Calendar, User, Stethoscope, Pill, ClipboardList, AlertCircle, UserPlus } from 'lucide-react';
import Link from 'next/link';

interface VisitData {
    id: string;
    visitDate: string;
    provider?: string;
    summary?: string;
    diagnoses?: string[];
    medications?: {
        started?: Array<{ name: string; dosage?: string; frequency?: string }>;
        stopped?: Array<{ name: string }>;
        changed?: Array<{ name: string; change?: string }>;
    };
    nextSteps?: string[];
    patientName?: string;
}

export default function SharedVisitPage() {
    const params = useParams();
    const userId = params.userId as string;
    const visitId = params.visitId as string;

    const [visit, setVisit] = useState<VisitData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadVisit() {
            try {
                // Fetch shared visit data from API
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api'}/v1/shared/visits/${userId}/${visitId}`
                );

                if (!response.ok) {
                    if (response.status === 410) {
                        setError('This visit link now requires a signed-in caregiver account.');
                        return;
                    }
                    if (response.status === 404) {
                        setError('Visit not found or sharing has expired');
                    } else {
                        setError('Unable to load visit summary');
                    }
                    return;
                }

                const data = await response.json();
                setVisit(data);
            } catch (err) {
                console.error('Failed to load shared visit:', err);
                setError('Failed to load visit summary');
            } finally {
                setLoading(false);
            }
        }

        if (userId && visitId) {
            loadVisit();
        }
    }, [userId, visitId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-background-subtle">
                <div className="container max-w-3xl mx-auto py-8 px-4">
                    <div className="flex items-center gap-3 mb-6">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-8 w-48" />
                    </div>
                    <Card variant="elevated" padding="lg" className="space-y-6">
                        <Skeleton className="h-6 w-64" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </Card>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background-subtle flex items-center justify-center">
                <Card variant="elevated" padding="lg" className="max-w-md text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 rounded-full bg-status-error/10">
                            <AlertCircle className="h-8 w-8 text-status-error" />
                        </div>
                    </div>
                    <h1 className="text-xl font-semibold text-text-primary mb-2">
                        Unable to Load Visit
                    </h1>
                    <p className="text-text-secondary mb-6">{error}</p>
                    <Link href="/">
                        <Button variant="secondary">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Go to LumiMD
                        </Button>
                    </Link>
                </Card>
            </div>
        );
    }

    if (!visit) return null;

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="min-h-screen bg-background-subtle">
            {/* Header */}
            <header className="bg-background border-b border-border-light sticky top-0 z-10">
                <div className="container max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-brand-primary flex items-center justify-center">
                            <span className="text-white font-bold text-lg">L</span>
                        </div>
                        <div>
                            <h1 className="font-semibold text-text-primary">LumiMD</h1>
                            <p className="text-xs text-text-muted">Shared Visit Summary</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container max-w-3xl mx-auto py-8 px-4">
                {/* Account CTA */}
                <Card variant="elevated" padding="lg" className="mb-6 bg-brand-primary/5 border-brand-primary/20">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-brand-primary/10">
                            <UserPlus className="h-6 w-6 text-brand-primary" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-lg font-semibold text-text-primary mb-1">
                                Join LumiMD
                            </h2>
                            <p className="text-text-secondary text-sm mb-4">
                                Create a free account to view detailed visit history, track health trends, and stay connected with {visit.patientName ? visit.patientName + "'s" : "your loved one's"} care journey.
                            </p>
                            <Link href={`/sign-up?invite=caregiver`}>
                                <Button className="w-full sm:w-auto">
                                    Create Free Account
                                </Button>
                            </Link>
                        </div>
                    </div>
                </Card>

                {/* Visit Header */}
                <Card variant="elevated" padding="lg" className="mb-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-brand-primary/10">
                            <Stethoscope className="h-6 w-6 text-brand-primary" />
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-semibold text-text-primary">
                                {visit.patientName ? `Visit Summary for ${visit.patientName}` : 'Visit Summary'}
                            </h2>
                            <div className="flex flex-wrap gap-4 mt-2 text-sm text-text-secondary">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4" />
                                    {formatDate(visit.visitDate)}
                                </div>
                                {visit.provider && (
                                    <div className="flex items-center gap-1.5">
                                        <User className="h-4 w-4" />
                                        {visit.provider}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Summary */}
                {visit.summary && (
                    <Card variant="elevated" padding="lg" className="mb-6">
                        <h3 className="font-semibold text-text-primary mb-3">Summary</h3>
                        <p className="text-text-secondary whitespace-pre-wrap">{visit.summary}</p>
                    </Card>
                )}

                {/* Diagnoses */}
                {visit.diagnoses && visit.diagnoses.length > 0 && (
                    <Card variant="elevated" padding="lg" className="mb-6">
                        <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-brand-primary" />
                            Diagnoses Discussed
                        </h3>
                        <ul className="space-y-2">
                            {visit.diagnoses.map((diagnosis, i) => (
                                <li key={i} className="text-text-secondary flex items-start gap-2">
                                    <span className="text-brand-primary mt-1">•</span>
                                    {diagnosis}
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                {/* Medications */}
                {visit.medications && (
                    Object.values(visit.medications).some(arr => arr && arr.length > 0)
                ) && (
                        <Card variant="elevated" padding="lg" className="mb-6">
                            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                                <Pill className="h-5 w-5 text-brand-primary" />
                                Medication Updates
                            </h3>
                            <div className="space-y-4">
                                {visit.medications.started && visit.medications.started.length > 0 && (
                                    <div>
                                        <p className="text-sm font-medium text-status-success mb-2">Started</p>
                                        <ul className="space-y-1">
                                            {visit.medications.started.map((med, i) => (
                                                <li key={i} className="text-text-secondary text-sm">
                                                    <span className="font-medium">{med.name}</span>
                                                    {med.dosage && ` - ${med.dosage}`}
                                                    {med.frequency && ` (${med.frequency})`}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {visit.medications.stopped && visit.medications.stopped.length > 0 && (
                                    <div>
                                        <p className="text-sm font-medium text-status-error mb-2">Stopped</p>
                                        <ul className="space-y-1">
                                            {visit.medications.stopped.map((med, i) => (
                                                <li key={i} className="text-text-secondary text-sm">
                                                    {med.name}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {visit.medications.changed && visit.medications.changed.length > 0 && (
                                    <div>
                                        <p className="text-sm font-medium text-status-warning mb-2">Changed</p>
                                        <ul className="space-y-1">
                                            {visit.medications.changed.map((med, i) => (
                                                <li key={i} className="text-text-secondary text-sm">
                                                    <span className="font-medium">{med.name}</span>
                                                    {med.change && ` - ${med.change}`}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}

                {/* Next Steps */}
                {visit.nextSteps && visit.nextSteps.length > 0 && (
                    <Card variant="elevated" padding="lg" className="mb-6">
                        <h3 className="font-semibold text-text-primary mb-3">Next Steps</h3>
                        <ul className="space-y-2">
                            {visit.nextSteps.map((step, i) => (
                                <li key={i} className="text-text-secondary flex items-start gap-2">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary text-sm flex items-center justify-center font-medium">
                                        {i + 1}
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                {/* Footer */}
                <div className="text-center text-sm text-text-muted mt-8">
                    <p>This summary was shared by a LumiMD user.</p>
                    <p className="mt-1">
                        <Link href="/" className="text-brand-primary hover:underline">
                            Learn more about LumiMD
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
