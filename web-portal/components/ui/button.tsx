import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-primary text-white shadow-elevated hover:shadow-hover hover:-translate-y-0.5 active:translate-y-0',
        secondary:
          'bg-surface border-2 border-brand-primary text-brand-primary shadow-base hover:bg-brand-primary-pale hover:shadow-md',
        ghost:
          'text-brand-primary hover:bg-hover active:bg-pressed',
        success:
          'bg-success text-white shadow-base hover:bg-success-dark hover:shadow-md',
        danger:
          'bg-error text-white shadow-base hover:bg-error-dark hover:shadow-md',
        outline:
          'border-2 border-border bg-surface text-text-primary hover:bg-background-subtle hover:border-brand-primary/40',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-6 text-base',
        lg: 'h-[52px] px-8 text-lg',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      type,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;

    const classes = cn(
      buttonVariants({ variant, size, fullWidth, className }),
      isDisabled && 'pointer-events-none opacity-70'
    );

    const content = (
      <span className="flex items-center justify-center gap-2">
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {!loading && leftIcon && (
          <span className="inline-flex" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <span className={cn(loading && 'opacity-0')}>{children}</span>
        {!loading && rightIcon && (
          <span className="inline-flex" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </span>
    );

    if (asChild) {
      return (
        <Comp
          className={classes}
          ref={ref}
          aria-disabled={isDisabled || undefined}
          data-disabled={isDisabled ? '' : undefined}
          {...props}
        >
          {content}
        </Comp>
      );
    }

    return (
      <button
        className={classes}
        ref={ref}
        disabled={isDisabled}
        type={type ?? 'button'}
        {...props}
      >
        {content}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
