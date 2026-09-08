import type { Config } from 'tailwindcss';

const LEAD_STATUS_KEYS = [
  'new',
  'ready',
  'contacted',
  'qualified',
  'negotiation',
  'customer',
  'lost',
] as const;

const CONVERSATION_STATUS_KEYS = ['open', 'waiting', 'resolved'] as const;

const INTERACTION_RESULT_KEYS = [
  'opened',
  'sent',
  'responded',
  'no-response',
  'callback',
  'no-interest',
  'invalid',
  'other',
] as const;

const statusColors = Object.fromEntries(
  LEAD_STATUS_KEYS.map((key) => [
    key,
    {
      DEFAULT: `var(--status-${key}-fg)`,
      fg: `var(--status-${key}-fg)`,
      bg: `var(--status-${key}-bg)`,
      border: `var(--status-${key}-border)`,
    },
  ]),
);

const conversationColors = Object.fromEntries(
  CONVERSATION_STATUS_KEYS.map((key) => [
    key,
    {
      DEFAULT: `var(--conversation-${key}-fg)`,
      fg: `var(--conversation-${key}-fg)`,
      bg: `var(--conversation-${key}-bg)`,
      border: `var(--conversation-${key}-border)`,
    },
  ]),
);

const resultColors = Object.fromEntries(
  INTERACTION_RESULT_KEYS.map((key) => [
    key,
    {
      DEFAULT: `var(--result-${key}-fg)`,
      fg: `var(--result-${key}-fg)`,
      bg: `var(--result-${key}-bg)`,
      border: `var(--result-${key}-border)`,
    },
  ]),
);

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
  ],
  theme: {
    // Escala tipográfica FECHADA em 6 tamanhos (regra ux-ui-crm §1).
    // Substitui a escala do Tailwind em vez de estendê-la: text-2xl e acima não existem.
    fontSize: {
      '2xs': ['0.6875rem', { lineHeight: '0.875rem' }], // 11px
      xs: ['0.75rem', { lineHeight: '1rem' }], // 12px
      sm: ['0.8125rem', { lineHeight: '1.125rem' }], // 13px — corpo de tabela
      base: ['0.875rem', { lineHeight: '1.25rem' }], // 14px
      lg: ['1rem', { lineHeight: '1.375rem' }], // 16px
      xl: ['1.25rem', { lineHeight: '1.625rem' }], // 20px — título de página
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        'accent-brand': 'var(--accent-brand)',
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        subtle: 'var(--subtle)',
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        'chart-ink': 'var(--chart-ink)',
        status: statusColors,
        conversation: conversationColors,
        result: resultColors,
        identity: {
          0: 'var(--identity-0)',
          1: 'var(--identity-1)',
          2: 'var(--identity-2)',
          3: 'var(--identity-3)',
          4: 'var(--identity-4)',
          5: 'var(--identity-5)',
          fg: 'var(--identity-fg)',
        },
      },
      borderRadius: {
        // Raio único de 6px; aninhado usa o menor.
        sm: 'calc(var(--radius) - 2px)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius)',
        xl: 'var(--radius)',
      },
      boxShadow: {
        // Sombra existe apenas em camada flutuante.
        overlay: 'var(--shadow-overlay)',
        none: 'none',
      },
      spacing: {
        sidebar: '14rem', // 224px
        'sidebar-collapsed': '3rem', // 48px
      },
      transitionDuration: {
        fast: '100ms',
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'overlay-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'layer-in': {
          from: { opacity: '0', transform: 'translateY(-2px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'overlay-in': 'overlay-in 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        'layer-in': 'layer-in 150ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
