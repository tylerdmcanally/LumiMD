'use client';

import { Toaster } from 'sonner';

/**
 * Toast Provider Component
 *
 * Provides toast notifications throughout the application.
 * Uses sonner library for lightweight, accessible toast notifications.
 *
 * Usage in components:
 * ```tsx
 * import { toast } from 'sonner';
 *
 * // Success toast
 * toast.success('Operation completed successfully');
 *
 * // Error toast
 * toast.error('Something went wrong');
 *
 * // Info toast
 * toast.info('New message received');
 *
 * // Warning toast
 * toast.warning('Please review your changes');
 *
 * // Custom toast with action
 * toast('Event created', {
 *   action: {
 *     label: 'Undo',
 *     onClick: () => console.log('Undo'),
 *   },
 * });
 * ```
 */
export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      expand={false}
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border border-border-light shadow-floating backdrop-blur-sm',
          title: 'text-base font-semibold text-text-primary',
          description: 'text-sm text-text-secondary',
          actionButton: 'bg-brand-primary text-white hover:bg-brand-primary-dark',
          cancelButton: 'bg-background-subtle text-text-secondary hover:bg-hover',
          closeButton: 'bg-background-subtle text-text-secondary hover:bg-hover hover:text-text-primary',
          error: 'bg-surface border-error/20',
          success: 'bg-surface border-success/20',
          warning: 'bg-surface border-warning/20',
          info: 'bg-surface border-brand-primary/20',
        },
        style: {
          minHeight: '60px',
          fontSize: '16px', // Prevent iOS auto-zoom
        },
      }}
    />
  );
}
