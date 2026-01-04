/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Override Tailwind's teal palette with our lighter brand colors
        teal: {
          50: '#E1F9FA',   // brand-primary-pale
          100: '#BEE7DF',  // brand-accent-light
          200: '#89D8C6',  // brand-secondary (mint)
          300: '#5DD3D9',  // brand-primary-light
          400: '#40C9D0',  // brand-primary (main cyan)
          500: '#40C9D0',  // brand-primary
          600: '#0A99A4',  // brand-accent
          700: '#078A94',  // brand-primary-dark
          800: '#067078',  // slightly darker
          900: '#055A60',  // dark (but lighter than default)
        },
        // Official LumiMD Brand Colors (cyan ➝ mint gradient)
        brand: {
          primary: '#40C9D0',       // Cyan - Primary brand color
          'primary-dark': '#078A94', // Deep teal for CTA
          'primary-light': '#5DD3D9',
          'primary-pale': '#E1F9FA', // Very light background
          secondary: '#89D8C6',      // Mint
          accent: '#0A99A4',         // Deep teal accent
          'accent-light': '#BEE7DF',
          // Legacy aliases (for backward compatibility with existing HTML)
          teal: '#40C9D0',
          sage: '#E1F9FA',
          dark: '#1A2332',
          gray: '#F8FAFB',
        },
        // Background & Surface
        surface: '#FFFFFF',
        background: {
          DEFAULT: '#F8FAFB',
          subtle: '#F3F5F7',
        },
        // Text Hierarchy
        text: {
          primary: '#1A2332',
          secondary: '#4A5568',
          tertiary: '#6B7280',
          muted: '#9CA3AF',
        },
        // Status Colors
        success: {
          DEFAULT: '#34D399',
          light: '#D1FAE5',
        },
        warning: {
          DEFAULT: '#FBBF24',
          light: '#FEF3C7',
        },
        error: {
          DEFAULT: '#F87171',
          light: '#FEE2E2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Merriweather', 'Georgia', 'serif'],
      },
      boxShadow: {
        // Brand-colored shadows for a cohesive feel
        'sm': '0 2px 8px rgba(64, 201, 208, 0.05)',
        'soft': '0 4px 20px rgba(64, 201, 208, 0.09)',
        'elevated': '0 4px 20px rgba(64, 201, 208, 0.09)',
        'float': '0 12px 40px rgba(64, 201, 208, 0.13)',
        'hover': '0 8px 32px rgba(64, 201, 208, 0.17)',
      },
      animation: {
        blob: "blob 7s infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" }
        }
      }
    },
  },
  plugins: [],
}
