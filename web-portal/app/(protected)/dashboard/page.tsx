'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Stethoscope, Pill, ClipboardCheck, ArrowRight } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useViewing } from '@/lib/contexts/ViewingContext';
import { useActions, useMedications, useUserProfile, useVisits } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const user = useCurrentUser();
  const { viewingUserId, isViewingShared } = useViewing();

  // For current user's name (logged-in account) and viewed user's name (data owner)
  const { data: currentUserProfile, isLoading: profileLoading } = useUserProfile(user?.uid ?? null);
  const { data: viewedProfile } = useUserProfile();
  const { data: visits = [], isLoading: visitsLoading } = useVisits();
  const { data: actions = [], isLoading: actionsLoading } = useActions();
  const { data: medications = [], isLoading: medicationsLoading } = useMedications();

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

  const recentVisits = React.useMemo(() => {
    return [...visits]
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [visits]);

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
    if (profileName && profileName.length > 0) return profileName;
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

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-10 animate-fade-in-up">
        {/* Hero Section - Welcome Card */}
        <Card
          variant="elevated"
          padding="lg"
          className="relative overflow-hidden border border-border-light bg-surface text-text-primary shadow-floating"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 via-brand-primary-pale/40 to-transparent" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-primary-dark">
                {greeting}
              </span>
              <h1 className="text-3xl font-bold lg:text-4xl text-text-primary">
                {isViewingShared ? `${viewedName}'s Health` : `Welcome back, ${viewedName}`}
              </h1>
              <div className="flex flex-col gap-2">
                {isViewingShared ? (
                  <>
                    <p className="text-sm font-semibold text-brand-primary">
                      Viewing shared data (read-only)
                    </p>
                    <p className="max-w-2xl text-base text-text-secondary">
                      You can browse visits, medications, and action items for this shared account.
                    </p>
                  </>
                ) : (
                  <p className="max-w-2xl text-base text-text-secondary">
                    Pick up right where you left off—review recent visits, keep medications up to
                    date, and move action items forward with confidence.
                  </p>
                )}
                {user?.email && (
                  <p className="text-xs text-text-tertiary">
                    Logged in as {user.email}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Quick Stats */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <StatCard
            icon={<ClipboardCheck className="h-6 w-6" />}
            label="Pending Actions"
            value={pendingActions.length}
            trend={pendingActions.length > 0 ? 'Needs attention' : 'All caught up'}
            variant={pendingActions.length > 0 ? 'warning' : 'success'}
            isLoading={actionsLoading}
            href="/actions"
          />
          <StatCard
            icon={<Stethoscope className="h-6 w-6" />}
            label="Total Visits"
            value={visits.length}
            trend="Recorded visits"
            variant="info"
            isLoading={visitsLoading}
            href="/visits"
          />
          <StatCard
            icon={<Pill className="h-6 w-6" />}
            label="Active Medications"
            value={activeMedications.length}
            trend="Currently taking"
            variant="brand"
            isLoading={medicationsLoading}
            href="/medications"
          />
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Recent Activity */}
          <Card variant="elevated" padding="lg">
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">
                    Recent Activity
                  </h2>
                  <p className="text-sm text-text-secondary mt-1">
                    Your latest visits and updates
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recentVisits.length > 0 ? (
                  recentVisits.map((visit: any) => (
                    <ActivityItem
                      key={visit.id}
                      title={visit.provider || 'Medical Visit'}
                      subtitle={visit.specialty || 'General'}
                      date={visit.createdAt}
                      icon={<Stethoscope className="h-4 w-4" />}
                      href={`/visits/${visit.id}`}
                    />
                  ))
                ) : (
                  <p className="text-center py-8 text-text-muted">
                    No recent activity yet
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  icon,
  label,
  value,
  trend,
  variant,
  isLoading,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  trend: string;
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
      padding="lg"
      interactive
      className={cn('h-full transition-smooth', href && 'group')}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-lg',
              variantClasses[variant],
            )}
          >
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-text-secondary">{label}</p>
            {isLoading ? (
              <div className="mt-2 h-10 w-20 rounded bg-background-subtle animate-pulse-soft" />
            ) : (
              <p className="mt-1 text-4xl font-bold text-text-primary">{value}</p>
            )}
            <p className="mt-2 text-xs text-text-muted">{trend}</p>
          </div>
        </div>
        <ArrowRight className={cn('h-5 w-5 text-text-tertiary transition-smooth', href && 'group-hover:translate-x-1')} />
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

function ActivityItem({
  title,
  subtitle,
  date,
  icon,
  href,
}: {
  title: string;
  subtitle: string;
  date: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-start gap-3 rounded-lg border border-border-light bg-surface p-4 transition-smooth hover:bg-hover hover:shadow-base">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate" title={title}>
            {title}
          </p>
          <p className="text-sm text-text-secondary mt-0.5 truncate" title={subtitle}>
            {subtitle}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {format(new Date(date), 'MMM d, yyyy')}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 text-text-tertiary" />
      </div>
    </Link>
  );
}
