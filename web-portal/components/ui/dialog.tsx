'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Drawer as DrawerPrimitive } from 'vaul';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

// =============================================================================
// CONTEXT FOR RESPONSIVE BEHAVIOR
// =============================================================================

const ResponsiveDialogContext = React.createContext<{ isDesktop: boolean }>({ isDesktop: true });

// =============================================================================
// RESPONSIVE DIALOG ROOT
// Automatically uses Drawer on mobile, Dialog on desktop
// =============================================================================

interface DialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  modal?: boolean;
}

function Dialog({ children, open, onOpenChange, defaultOpen, modal = true }: DialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (isDesktop) {
    return (
      <ResponsiveDialogContext.Provider value={{ isDesktop: true }}>
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen} modal={modal}>
          {children}
        </DialogPrimitive.Root>
      </ResponsiveDialogContext.Provider>
    );
  }

  // Mobile: Use drawer without scaling background (prevents rendering artifacts)
  return (
    <ResponsiveDialogContext.Provider value={{ isDesktop: false }}>
      <DrawerPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        shouldScaleBackground={false}
      >
        {children}
      </DrawerPrimitive.Root>
    </ResponsiveDialogContext.Provider>
  );
}

// =============================================================================
// DIALOG TRIGGER
// =============================================================================

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(({ ...props }, ref) => {
  const { isDesktop } = React.useContext(ResponsiveDialogContext);

  if (isDesktop) {
    return <DialogPrimitive.Trigger ref={ref} {...props} />;
  }

  return <DrawerPrimitive.Trigger ref={ref} {...props} />;
});
DialogTrigger.displayName = 'DialogTrigger';

// =============================================================================
// DIALOG CLOSE
// =============================================================================

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ ...props }, ref) => {
  const { isDesktop } = React.useContext(ResponsiveDialogContext);

  if (isDesktop) {
    return <DialogPrimitive.Close ref={ref} {...props} />;
  }

  return <DrawerPrimitive.Close ref={ref} {...props} />;
});
DialogClose.displayName = 'DialogClose';

// =============================================================================
// OVERLAYS (optimized for smooth rendering)
// =============================================================================

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Simpler overlay without backdrop-blur to prevent rendering artifacts
      'fixed inset-0 z-modal bg-black/40',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      // Simple solid overlay for mobile - no blur effects
      'fixed inset-0 z-modal bg-black/40',
      className
    )}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

// =============================================================================
// RESPONSIVE DIALOG CONTENT
// =============================================================================

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { forceDesktopMode?: boolean }
>(({ className, children, forceDesktopMode = false, ...props }, ref) => {
  const { isDesktop } = React.useContext(ResponsiveDialogContext);
  const useDrawer = !forceDesktopMode && !isDesktop;

  // Mobile: Use bottom drawer
  if (useDrawer) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerOverlay />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            'fixed inset-x-0 bottom-0 z-modal flex h-auto max-h-[90dvh] flex-col',
            // Clean background without border (border can cause visible line)
            'rounded-t-2xl bg-surface shadow-lg',
            'focus:outline-none',
            // GPU acceleration for smooth animations
            'transform-gpu',
            className
          )}
          {...props}
        >
          {/* Drag Handle */}
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-text-muted/30" />
          {/* Scrollable Content - optimized for iOS */}
          <div
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden px-6 py-3',
              // iOS scroll optimization
              'overscroll-contain',
            )}
            style={{
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="flex flex-col gap-4 pb-6">
              {children}
            </div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  // Desktop: Use centered dialog
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(
          'fixed left-[50%] top-[50%] z-modal translate-x-[-50%] translate-y-[-50%]',
          'w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden',
          'rounded-2xl border border-border-light bg-surface shadow-floating',
          'flex flex-col',
          // GPU acceleration
          'transform-gpu',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]',
          className
        )}
        {...props}
      >
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-8"
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="flex flex-col gap-5 lg:gap-6">
            {children}
          </div>
        </div>
        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full z-10',
            'bg-background-subtle text-text-tertiary hover:text-text-primary hover:bg-hover',
            'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            'disabled:pointer-events-none'
          )}
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = 'DialogContent';

// =============================================================================
// DIALOG HEADER / FOOTER / TITLE / DESCRIPTION
// =============================================================================

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-2', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-3 sm:flex-row sm:justify-end pt-4',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const { isDesktop } = React.useContext(ResponsiveDialogContext);

  if (isDesktop) {
    return (
      <DialogPrimitive.Title
        ref={ref}
        className={cn(
          'text-xl font-semibold leading-tight tracking-tight text-text-primary',
          className
        )}
        {...props}
      />
    );
  }

  return (
    <DrawerPrimitive.Title
      ref={ref}
      className={cn(
        'text-lg font-semibold leading-tight tracking-tight text-text-primary text-center',
        className
      )}
      {...props}
    />
  );
});
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { isDesktop } = React.useContext(ResponsiveDialogContext);

  if (isDesktop) {
    return (
      <DialogPrimitive.Description
        ref={ref}
        className={cn('text-sm text-text-secondary', className)}
        {...props}
      />
    );
  }

  return (
    <DrawerPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-secondary text-center', className)}
      {...props}
    />
  );
});
DialogDescription.displayName = 'DialogDescription';

// Keep portal for backwards compatibility
const DialogPortal = DialogPrimitive.Portal;

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
