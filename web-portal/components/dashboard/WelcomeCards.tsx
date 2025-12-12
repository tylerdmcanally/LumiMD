'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, Pill, Users, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WelcomeCard {
    icon: React.ReactNode;
    title: string;
    description: string;
    href?: string;
    external?: boolean;
    onClick?: () => void;
    variant: 'primary' | 'secondary' | 'tertiary';
}

const welcomeCards: WelcomeCard[] = [
    {
        icon: <Download className="h-6 w-6" />,
        title: 'Download iOS App',
        description: 'Record visits with AI-powered transcription and get instant summaries',
        href: 'https://apps.apple.com/app/lumimd',
        external: true,
        variant: 'primary',
    },
    {
        icon: <Pill className="h-6 w-6" />,
        title: 'Add Medications',
        description: 'Track your prescriptions and get medication warnings',
        href: '/medications',
        variant: 'secondary',
    },
    {
        icon: <Users className="h-6 w-6" />,
        title: 'Invite Caregiver',
        description: 'Share read-only access with family members or caregivers',
        href: '/sharing',
        variant: 'tertiary',
    },
];

export function WelcomeCards() {
    return (
        <section className="space-y-6">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-text-primary">
                    Welcome to LumiMD
                </h2>
                <p className="text-text-secondary">
                    Here's what you can do to get started
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {welcomeCards.map((card, index) => (
                    <WelcomeCardItem key={index} card={card} />
                ))}
            </div>
        </section>
    );
}

function WelcomeCardItem({ card }: { card: WelcomeCard }) {
    const variantStyles = {
        primary: 'border-brand-primary/20 bg-brand-primary/5 hover:bg-brand-primary/10 hover:border-brand-primary/30',
        secondary: 'border-blue-500/20 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-500/30 dark:bg-blue-950/20 dark:hover:bg-blue-950/30',
        tertiary: 'border-purple-500/20 bg-purple-50/50 hover:bg-purple-50 hover:border-purple-500/30 dark:bg-purple-950/20 dark:hover:bg-purple-950/30',
    };

    const iconStyles = {
        primary: 'bg-brand-primary/10 text-brand-primary',
        secondary: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        tertiary: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    };

    const content = (
        <>
            <div className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full mb-4',
                iconStyles[card.variant]
            )}>
                {card.icon}
            </div>

            <h3 className="text-lg font-semibold text-text-primary mb-2">
                {card.title}
            </h3>

            <p className="text-sm text-text-secondary mb-4 flex-1">
                {card.description}
            </p>

            <div className="flex items-center gap-2 text-sm font-medium text-brand-primary">
                <span>Get started</span>
                <ArrowRight className="h-4 w-4" />
            </div>
        </>
    );

    const className = cn(
        'group relative flex flex-col h-full p-6 border-2 rounded-xl transition-all duration-200',
        'cursor-pointer',
        variantStyles[card.variant]
    );

    if (card.href) {
        if (card.external) {
            return (
                <a
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                >
                    {content}
                </a>
            );
        }

        return (
            <Link href={card.href} className={className}>
                {content}
            </Link>
        );
    }

    if (card.onClick) {
        return (
            <button onClick={card.onClick} className={className}>
                {content}
            </button>
        );
    }

    return <div className={className}>{content}</div>;
}
