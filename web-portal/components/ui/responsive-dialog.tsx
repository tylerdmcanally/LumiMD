'use client';

import * as React from 'react';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from '@/components/ui/dialog';

import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerFooter,
    DrawerTitle,
    DrawerDescription,
    DrawerClose,
} from '@/components/ui/drawer';

interface ResponsiveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
}

/**
 * ResponsiveDialog - Uses bottom drawer on mobile, centered dialog on desktop.
 * This provides better keyboard handling on mobile devices.
 */
export function ResponsiveDialog({
    open,
    onOpenChange,
    children,
}: ResponsiveDialogProps) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent>{children}</DialogContent>
            </Dialog>
        );
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent>{children}</DrawerContent>
        </Drawer>
    );
}

// Re-export header/footer that work with both
export function ResponsiveDialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (isDesktop) {
        return <DialogHeader className={className} {...props} />;
    }

    return <DrawerHeader className={className} {...props} />;
}

export function ResponsiveDialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (isDesktop) {
        return <DialogFooter className={className} {...props} />;
    }

    return <DrawerFooter className={className} {...props} />;
}

export function ResponsiveDialogTitle({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (isDesktop) {
        return (
            <DialogTitle className={className} {...props}>
                {children}
            </DialogTitle>
        );
    }

    return (
        <DrawerTitle className={className} {...props}>
            {children}
        </DrawerTitle>
    );
}

export function ResponsiveDialogDescription({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (isDesktop) {
        return (
            <DialogDescription className={className} {...props}>
                {children}
            </DialogDescription>
        );
    }

    return (
        <DrawerDescription className={className} {...props}>
            {children}
        </DrawerDescription>
    );
}

export function ResponsiveDialogClose({
    className,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (isDesktop) {
        return (
            <DialogClose className={className} {...props}>
                {children}
            </DialogClose>
        );
    }

    return (
        <DrawerClose className={className} {...props}>
            {children}
        </DrawerClose>
    );
}
