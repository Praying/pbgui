import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — the shadcn class-merging helper. Combines conditional classes and
 * resolves Tailwind conflicts so component callers can override tokens
 * without fighting the base classes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
