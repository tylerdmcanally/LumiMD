'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Stethoscope,
  Pill,
  ClipboardCheck,
  ArrowRight,
  AlertTriangle,
  Users,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';
import { LatestVisitCard } from '@/components/visits/LatestVisitCard';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useViewing } from '@/lib/contexts/ViewingContext';
import { useActions, useMedications, useUserProfile, useVisits } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { WelcomeCards } from '@/components/dashboard/WelcomeCards';

export default function DashboardPage() {
  const user = useCurrentUser();
  const { viewingUserId } = useViewing();

  // For current user's name (logged-in account) and viewed user's name (data owner)
  const { data: currentUserProfile, isLoading: profileLoading } = useUserProfile(user?.uid ?? null);
  const { data: viewedProfile } = useUserProfile();
  const { data: visits = [], isLoading: visitsLoading } = useVisits();
  const { data: actions = [], isLoading: actionsLoading } = useActions();
  const { data: medications = [], isLoading: medicationsLoading } = useMedications();
  const { data: userProfile } = useUserProfile();

  const pendingActions = React.useMemo(
    () => actions.filter((action: any) => !action.completed),
    [actions]
  );

  const activeMedications = React.useMemo(
    () =>
      medications.filter(
        (med: any) => med.active !== false && med.stoppedAt == null
      ),
    [medications]
  );

  // Get the most recent visit
  const latestVisit = React.useMemo(() => {
    if (!visits.length) return null;
    const sorted = [...visits].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    return sorted[0];
  }, [visits]);

  // Count medication changes and action items from latest visit
  const latestVisitStats = React.useMemo(() => {
    if (!latestVisit) return { medicationChanges: 0, actionItems: 0 };

    // Count medications associated with this visit
    const visitMeds = medications.filter(
      (med: any) => med.visitId === latestVisit.id
    );

    // Count action items from this visit
    const visitActions = actions.filter(
      (action: any) => action.visitId === latestVisit.id && !action.completed
    );

    return {
      medicationChanges: visitMeds.length,
      actionItems: visitActions.length,
    };
  }, [latestVisit, medications, actions]);

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Name of the data being viewed (self or shared)
  const viewedName = React.useMemo(() => {
    const profileName =
      (typeof viewedProfile?.preferredName === 'string' && viewedProfile.preferredName.trim()) ||
      (typeof viewedProfile?.firstName === 'string' && viewedProfile.firstName.trim());
    const email =
      typeof (viewedProfile as any)?.email === 'string' && (viewedProfile as any).email
        ? (viewedProfile as any).email
        : '';
    if (profileName && profileName.length > 0) return profileName;
    if (email) return email;
    if (viewingUserId && viewingUserId !== user?.uid) return 'Shared Health';

    const selfName =
      (typeof currentUserProfile?.preferredName === 'string' && currentUserProfile.preferredName.trim()) ||
      (typeof currentUserProfile?.firstName === 'string' && currentUserProfile.firstName.trim());
    if (selfName && selfName.length > 0) return selfName;
    if (typeof user?.displayName === 'string' && user.displayName.trim().length > 0) {
      return user.displayName.trim().split(' ')[0];
    }
    if (!profileLoading && typeof user?.email === 'string' && user.email.length > 0) {
      return user.email.split('@')[0];
    }
    return 'there';
  }, [
    viewedProfile?.preferredName,
    viewedProfile?.firstName,
    currentUserProfile?.preferredName,
    currentUserProfile?.firstName,
    viewingUserId,
    user?.uid,
    user?.displayName,
    user?.email,
    profileLoading,
  ]);

  // Get allergies count for quick reference
  const allergiesCount = React.useMemo(() => {
    return Array.isArray(userProfile?.allergies) ? userProfile.allergies.length : 0;
  }, [userProfile?.allergies]);

  // Track if user has ever had data (to avoid showing welcome cards after deleting all data)
  const hasEverHadData = React.useRef(false);

  // Initialize from localStorage on mount
  React.useEffect(() => {
    if (user?.uid) {
      const hadDataBefore = localStorage.getItem(`lumimd_has_data_${user.uid}`) === 'true';
      if (hadDataBefore) {
        hasEverHadData.current = true;
      }
    }
  }, [user?.uid]);

  // Track when user adds data
  React.useEffect(() => {
    const hasData = visits.length > 0 || medications.length > 0 || actions.length > 0;

    if (hasData && user?.uid && !hasEverHadData.current) {
      // User has data now, remember this
      hasEverHadData.current = true;
      localStorage.setItem(`lumimd_has_data_${user.uid}`, 'true');
    }
  }, [visits.length, medications.length, actions.length, user?.uid]);

  // Check if user is completely new (no data AND never had data before)
  const isNewUser = React.useMemo(() => {
    return !visitsLoading && !medicationsLoading && !actionsLoading &&
      visits.length === 0 && medications.length === 0 && actions.length === 0 &&
      !hasEverHadData.current;
  }, [visits.length, medications.length, actions.length, visitsLoading, medicationsLoading, actionsLoading]);

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-8 animate-fade-in-up">
        {/* Welcome Header with warm background */}
        <div className="rounded-2xl bg-hero-brand p-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <span className="text-sm font-medium text-brand-primary-dark uppercase tracking-wider">
              {greeting}
            </span>
            <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
              Welcome back, {viewedName}
            </h1>
          </div>
        </div>

        {/* Welcome Cards for New Users */}
        {isNewUser && (
          <WelcomeCards />
        )}

        {/* Latest Visit Hero */}
        {!isNewUser && (
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Latest Visit</h2>
              </div>
              <LatestVisitCard
                visit={latestVisit}
                medicationChanges={latestVisitStats.medicationChanges}
                actionItems={latestVisitStats.actionItems}
                isLoading={visitsLoading}
              />
            </section>

            {/* Quick Stats Row */}
            <section>
              <h2 className="text-lg font-semibold text-text-primary mb-4">At a Glance</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <QuickStatCard
                  icon={<ClipboardCheck className="h-5 w-5" />}
                  label="Pending Actions"
                  value={pendingActions.length}
                  sublabel={pendingActions.length > 0 ? 'Needs attention' : 'All caught up'}
                  variant={pendingActions.length > 0 ? 'warning' : 'success'}
                  isLoading={actionsLoading}
                  href="/actions"
                />
                <QuickStatCard
                  icon={<Pill className="h-5 w-5" />}
                  label="Active Medications"
                  value={activeMedications.length}
                  sublabel="Currently taking"
                  variant="brand"
                  isLoading={medicationsLoading}
                  href="/medications"
                />
                <QuickStatCard
                  icon={<Stethoscope className="h-5 w-5" />}
                  label="Total Visits"
                  value={visits.length}
                  sublabel="All time"
                  variant="info"
                  isLoading={visitsLoading}
                  href="/visits"
                />
              </div>
            </section>
          </>
        )}

        {/* Past Visits Preview */}
        {visits.length > 1 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Past Visits</h2>
              <Link
                href="/visits"
                className="text-sm font-medium text-brand-primary hover:underline flex items-center gap-1"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visits
                .sort((a: any, b: any) => {
                  const aTime = new Date(a.createdAt || 0).getTime();
                  const bTime = new Date(b.createdAt || 0).getTime();
                  return bTime - aTime;
                })
                .slice(1, 4)
                .map((visit: any) => (
                  <PastVisitCard key={visit.id} visit={visit} />
                ))}
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function QuickStatCard({
  icon,
  label,
  value,
  sublabel,
  variant,
  isLoading,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel: string;
  variant: 'success' | 'warning' | 'brand' | 'info';
  isLoading?: boolean;
  href?: string;
}) {
  const variantClasses = {
    success: 'bg-success-light text-success-dark',
    warning: 'bg-warning-light text-warning-dark',
    brand: 'bg-brand-primary-pale text-brand-primary',
    info: 'bg-info-light text-info-dark',
  };

  const content = (
    <Card
      variant="elevated"
      padding="md"
      className="h-full transition-all duration-150 hover:shadow-hover hover:-translate-y-0.5 group"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            variantClasses[variant],
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-secondary truncate">{label}</p>
          {isLoading ? (
            <div className="h-7 w-12 rounded bg-background-subtle animate-pulse-soft mt-0.5" />
          ) : (
            <p className="text-2xl font-bold text-text-primary">{value}</p>
          )}
          <p className="text-xs text-text-muted truncate">{sublabel}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-text-tertiary transition-transform group-hover:translate-x-1" />
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return content;
}

function PastVisitCard({ visit }: { visit: any }) {
  const formattedDate = visit.createdAt
    ? format(new Date(visit.createdAt), 'MMM d, yyyy')
    : 'Unknown date';

  return (
    <Link href={`/visits/${visit.id}`}>
      <Card
        variant="elevated"
        padding="md"
        className="h-full transition-all duration-150 hover:shadow-hover hover:-translate-y-0.5 group"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary truncate">
              {visit.provider || 'Medical Visit'}
            </p>
            <p className="text-sm text-text-secondary truncate">
              {visit.specialty || 'General'}
            </p>
            <p className="text-xs text-text-muted mt-1">{formattedDate}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-text-tertiary transition-transform group-hover:translate-x-1" />
        </div>
      </Card>
    </Link>
  );
}