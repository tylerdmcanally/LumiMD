'use client';

import { useState, useEffect } from 'react';

/**
 * Cross-browser media query hook
 * Works on Chrome, Safari, Firefox, Edge
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const mediaQuery = window.matchMedia(query);

        // Set initial value
        setMatches(mediaQuery.matches);

        // Create event handler
        const handler = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // Modern browsers
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
        // Legacy browsers (Safari < 14)
        else if (mediaQuery.addListener) {
            mediaQuery.addListener(handler);
            return () => mediaQuery.removeListener(handler);
        }
    }, [query]);

    return matches;
}

/**
 * Convenience hook for mobile detection
 */
export function useIsMobile(): boolean {
    return !useMediaQuery('(min-width: 768px)');
}
