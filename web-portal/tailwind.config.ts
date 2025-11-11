import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Colors - Premium Design System
      colors: {
        // Brand Colors
        brand: {
          primary: '#0A99A4',
          'primary-dark': '#064E6D',
          accent: '#A3D8D0',
          'primary-light': '#1FB5C1',
          'primary-pale': '#E6F7F8',
          'accent-light': '#C5E8E4',
        },

        // Background
        background: {
          DEFAULT: '#F8FAFB',
          subtle: '#F3F5F7',
        },

        // Surface
        surface: '#FFFFFF',

        // Text
        text: {
          primary: '#1A2332',
          secondary: '#4A5568',
          tertiary: '#6B7280',
          muted: '#9CA3AF',
          inverse: '#FFFFFF',
        },

        // Status
        success: {
          DEFAULT: '#34D399',
          light: '#D1FAE5',
          dark: '#059669',
        },
        warning: {
          DEFAULT: '#FBBF24',
          light: '#FEF3C7',
          dark: '#D97706',
        },
        error: {
          DEFAULT: '#F87171',
          light: '#FEE2E2',
          dark: '#DC2626',
        },
        info: {
          DEFAULT: '#60A5FA',
          light: '#DBEAFE',
          dark: '#2563EB',
        },

        // Semantic
        border: {
          DEFAULT: 'rgba(26, 35, 50, 0.08)',
          light: 'rgba(26, 35, 50, 0.04)',
        },
        divider: 'rgba(26, 35, 50, 0.06)',
        overlay: 'rgba(26, 35, 50, 0.40)',
        hover: 'rgba(10, 153, 164, 0.08)',
        pressed: 'rgba(10, 153, 164, 0.12)',
        focus: 'rgba(10, 153, 164, 0.20)',
      },

      // Border Radius - Soft, Approachable
      borderRadius: {
        sm: '0.5rem',    // 8px
        md: '0.75rem',   // 12px
        lg: '1rem',      // 16px
        xl: '1.5rem',    // 24px
        '2xl': '2rem',   // 32px
        '3xl': '3rem',   // 48px
      },

      // Box Shadow - Elevated, Premium
      boxShadow: {
        sm: '0 2px 8px rgba(10, 153, 164, 0.04)',
        base: '0 4px 16px rgba(10, 153, 164, 0.06)',
        md: '0 4px 20px rgba(10, 153, 164, 0.08)',
        lg: '0 8px 32px rgba(10, 153, 164, 0.12)',
        xl: '0 12px 40px rgba(10, 153, 164, 0.16)',
        '2xl': '0 20px 60px rgba(10, 153, 164, 0.20)',
        elevated: '0 4px 20px rgba(10, 153, 164, 0.08)',
        floating: '0 12px 40px rgba(10, 153, 164, 0.12)',
        hover: '0 8px 32px rgba(10, 153, 164, 0.16)',
        inner: 'inset 0 2px 4px rgba(26, 35, 50, 0.06)',
      },

      // Font Family
      fontFamily: {
        sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
        mono: ['ui-monospace', 'SF Mono', ...defaultTheme.fontFamily.mono],
      },

      // Font Size
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],    // 12px
        sm: ['0.875rem', { lineHeight: '1.6' }],   // 14px
        base: ['1rem', { lineHeight: '1.6' }],     // 16px
        lg: ['1.125rem', { lineHeight: '1.6' }],   // 18px
        xl: ['1.25rem', { lineHeight: '1.4' }],    // 20px
        '2xl': ['1.5rem', { lineHeight: '1.2' }],  // 24px
        '3xl': ['1.875rem', { lineHeight: '1.2' }], // 30px
        '4xl': ['2.25rem', { lineHeight: '1.2' }],  // 36px
        '5xl': ['3rem', { lineHeight: '1.1' }],     // 48px
      },

      // Spacing - 8px Grid System
      spacing: {
        '18': '4.5rem',   // 72px
        '22': '5.5rem',   // 88px
        '26': '6.5rem',   // 104px
        '30': '7.5rem',   // 120px
        '34': '8.5rem',   // 136px
      },

      // Width & Height
      width: {
        sidebar: '280px',
        'sidebar-collapsed': '80px',
      },

      height: {
        topbar: '72px',
      },

      // Max Width
      maxWidth: {
        '8xl': '1440px',
      },

      // Z-Index
      zIndex: {
        dropdown: '100',
        sticky: '200',
        fixed: '300',
        overlay: '400',
        modal: '500',
        popover: '600',
        toast: '700',
        tooltip: '800',
      },

      // Animation
      animation: {
        'fade-in-up': 'fadeInUp 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-in-right': 'slideInRight 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        shimmer: 'shimmer 2s infinite',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },

      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },

      // Transitions
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },

      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      // Backdrop Blur
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
