'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'full' | '2xl' | 'xl' | 'lg';
}

const maxWidthClasses = {
  full: 'max-w-full',
  '2xl': 'max-w-8xl',
  xl: 'max-w-7xl',
  lg: 'max-w-6xl',
};

export function PageContainer({
  children,
  className,
  maxWidth = '2xl',
}: PageContainerProps) {
  return (
    <div className="min-h-full bg-background">
      <div
        className={cn(
          'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10',
          maxWidthClasses[maxWidth],
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between',
        className
      )}
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-base text-text-secondary max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

interface PageSectionProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export function PageSection({
  children,
  title,
  description,
  className,
}: PageSectionProps) {
  return (
    <section className={cn('space-y-6', className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
          )}
          {description && (
            <p className="text-sm text-text-secondary">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

