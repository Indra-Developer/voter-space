export const uiClasses = {
  button: 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60',
  primaryButton: 'border-primary bg-primary text-primary-contrast shadow-sm hover:bg-primary-strong',
  dangerButton: 'border-red-700 bg-red-700 text-white shadow-sm hover:border-red-800 hover:bg-red-800',
  secondaryButton: 'border-border bg-surface text-copy hover:border-primary hover:bg-nav-active hover:text-primary-strong',
  iconButton: 'inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
  input: 'min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-copy outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60',
  inputBare: 'min-h-10 w-full min-w-0 bg-transparent px-2 py-2 text-sm text-copy outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60',
  select: 'min-h-10 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-copy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15',
  card: 'rounded-card border border-border bg-surface shadow-card',
  menu: 'rounded-card border border-border bg-surface shadow-float',
  dialogBackdrop: 'fixed inset-0 z-20 grid place-items-center bg-slate-950/55 p-4',
  dialog: 'w-full max-w-md rounded-panel border border-border bg-surface p-5 text-copy shadow-float',
  menuItem: 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-muted transition hover:bg-nav-active hover:text-primary-strong',
  iconBadge: 'inline-grid size-10 shrink-0 place-items-center rounded-xl bg-surface-muted text-primary',
  mobileNavigationItem: 'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition hover:bg-nav-active hover:text-primary-strong',
} as const

export function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
