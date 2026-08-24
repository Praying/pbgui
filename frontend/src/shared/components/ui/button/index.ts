import { cva, type VariantProps } from 'class-variance-authority';

export { default as Button } from './Button.vue';

/**
 * Button variants — the shadcn CVA surface mapped onto the PBGui token
 * vocabulary. The visual language is the existing `.pbgui-btn`/`.btn`
 * system from components.css (soft tonal fills, 32px controls, tinted
 * borders), so pages still on the legacy classes render identically to
 * pages on this component until the migration finishes.
 */
export const buttonVariants = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-1 whitespace-nowrap rounded-sm border font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] ease-standard active:scale-[0.985] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'border-border-default bg-elevated text-primary hover:border-border-strong hover:bg-border-default',
        primary:
          'border-accent bg-accent font-semibold text-accent-contrast shadow-[0_2px_10px_rgb(var(--accent-rgb)/0.22)] hover:border-accent-soft hover:bg-accent-soft',
        secondary: 'border-border-default bg-card text-secondary hover:bg-border-default hover:text-primary',
        info: 'border-accent/35 bg-accent/14 text-accent-soft hover:border-accent hover:bg-accent/20',
        success: 'border-success/35 bg-success/13 text-success hover:border-success hover:bg-success/20',
        warning: 'border-warning/35 bg-warning/14 text-warning-soft hover:border-warning hover:bg-warning/20',
        danger: 'border-danger/35 bg-danger/13 text-danger-soft hover:border-danger hover:bg-danger/20 hover:text-danger',
        ghost: 'border-transparent bg-transparent text-secondary hover:bg-card hover:text-primary',
        outline: 'border-border-strong bg-transparent text-primary hover:bg-elevated',
      },
      size: {
        default: 'h-8 px-3 text-sm',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-9.5 px-4 text-md',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
