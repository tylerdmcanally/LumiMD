'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  LifeBuoy,
  X,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
const STORAGE_KEY = 'helperBannerDismissed';

export function HelpBanner() {
  const [isDismissed, setIsDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue === 'true') {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = React.useCallback(() => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, []);

  const handleRestore = React.useCallback(() => {
    setIsDismissed(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  if (isDismissed) {
    return (
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          leftIcon={<HelpCircle className="h-4 w-4" />}
          onClick={handleRestore}
        >
          Need help?
        </Button>
      </div>
    );
  }

  return (
    <Card
      variant="elevated"
      padding="lg"
      className="relative overflow-hidden border border-brand-primary/30 bg-gradient-to-br from-brand-primary/10 via-brand-primary-pale/40 to-surface"
    >
      <span className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-brand-primary/20 to-transparent" />

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss helper banner"
        className="absolute right-4 top-4 text-text-tertiary transition-opacity hover:text-text-primary"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-lg">
              <LifeBuoy className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-brand-primary-dark">
                Need a tour?
              </p>
              <h2 className="text-2xl font-semibold text-text-primary">
                Here’s what you can do in the web portal
              </h2>
            </div>
          </div>

          <ul className="grid gap-4 text-sm text-text-secondary md:grid-cols-3">
            {[
              {
                title: 'Visits',
                description: 'Review transcripts, insights, and share summaries.',
              },
              {
                title: 'Medications',
                description: 'Keep your list accurate and flag issues quickly.',
              },
              {
                title: 'Actions',
                description: 'Track follow-ups, reminders, and next steps.',
              },
            ].map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 rounded-lg border border-border-light bg-surface/80 p-4 shadow-sm"
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 text-brand-primary"
                  aria-hidden="true"
                />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-text-primary">{item.title}</p>
                  <p className="text-text-secondary">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 md:w-60">
          <Button
            asChild
            variant="primary"
            size="md"
            rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            <Link
              href="https://lumimd.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the web app
            </Link>
          </Button>
          <p className="text-xs text-text-tertiary">
            Need these tips later? Dismiss now and tap the “Need help?” badge to
            bring them back.
          </p>
        </div>
      </div>
    </Card>
  );
}

