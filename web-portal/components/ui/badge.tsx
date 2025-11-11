import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const toneStyles = {
  brand: {
    soft: 'bg-brand-primary-pale text-brand-primary-dark border border-brand-primary/20',
    solid: 'bg-brand-primary text-white border border-brand-primary/10 shadow-sm',
    outline: 'border border-brand-primary/40 text-brand-primary bg-transparent',
  },
  neutral: {
    soft: 'bg-background-subtle text-text-secondary border border-border',
    solid: 'bg-text-secondary text-white border border-text-secondary/10 shadow-sm',
    outline: 'border border-border text-text-secondary bg-transparent',
  },
  success: {
    soft: 'bg-success-light text-success-dark border border-success/20',
    solid: 'bg-success text-white border border-success-dark/20 shadow-sm',
    outline: 'border border-success/50 text-success-dark bg-transparent',
  },
  warning: {
    soft: 'bg-warning-light text-warning-dark border border-warning/20',
    solid: 'bg-warning text-text-primary border border-warning-dark/20 shadow-sm',
    outline: 'border border-warning/60 text-warning-dark bg-transparent',
  },
  danger: {
    soft: 'bg-error-light text-error-dark border border-error/20',
    solid: 'bg-error text-white border border-error-dark/20 shadow-sm',
    outline: 'border border-error/60 text-error-dark bg-transparent',
  },
  info: {
    soft: 'bg-info-light text-info-dark border border-info/20',
    solid: 'bg-info text-white border border-info-dark/20 shadow-sm',
    outline: 'border border-info/60 text-info-dark bg-transparent',
  },
} as const;

type BadgeTone = keyof typeof toneStyles;
type BadgeVariantStyle = keyof (typeof toneStyles)[BadgeTone];

const compoundVariants = (
  Object.entries(toneStyles) as Array<[BadgeTone, Record<BadgeVariantStyle, string>]>
).flatMap(([tone, variants]) =>
  (Object.entries(variants) as Array<[BadgeVariantStyle, string]>).map(([variant, className]) => ({
    tone,
    variant,
    className,
  })),
);

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-smooth', {
  variants: {
    variant: {
      soft: '',
      solid: '',
      outline: '',
    },
    tone: {
      brand: '',
      neutral: '',
      success: '',
      warning: '',
      danger: '',
      info: '',
    },
    size: {
      sm: 'text-xs h-6',
      md: 'text-sm h-8',
    },
  },
  compoundVariants,
  defaultVariants: {
    variant: 'soft',
    tone: 'brand',
    size: 'md',
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  leftIcon?: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, tone, size, leftIcon, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, tone, size }), className)}
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
