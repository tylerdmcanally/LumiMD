import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-smooth',
  {
    variants: {
      variant: {
        // Soft fills with 15-20% opacity backgrounds
        success:
          'bg-success-light text-success-dark border border-success/20',
        warning:
          'bg-warning-light text-warning-dark border border-warning/20',
        error:
          'bg-error-light text-error-dark border border-error/20',
        info:
          'bg-info-light text-info-dark border border-info/20',
        brand:
          'bg-brand-primary-pale text-brand-primary-dark border border-brand-primary/20',
        neutral:
          'bg-background-subtle text-text-secondary border border-border',
      },
      size: {
        sm: 'text-xs h-6',
        md: 'text-sm h-8',
      },
    },
    defaultVariants: {
      variant: 'brand',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  leftIcon?: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, leftIcon, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {leftIcon && (
        <span className="inline-flex items-center" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      <span className="inline-flex items-center">{children}</span>
    </span>
  )
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
