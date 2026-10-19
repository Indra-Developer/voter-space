import { Inbox, LoaderCircle, RefreshCcw, TriangleAlert, type LucideIcon } from 'lucide-react'

export type PageStateKind = 'loading' | 'empty' | 'error'

type PageStateProps = {
  kind: PageStateKind
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

const stateIcons: Record<PageStateKind, LucideIcon> = {
  loading: LoaderCircle,
  empty: Inbox,
  error: TriangleAlert,
}

export function PageState({ kind, title, description, actionLabel, onAction }: PageStateProps) {
  const Icon = stateIcons[kind]

  return (
    <section className={`page-state page-state-${kind}`} aria-live="polite">
      <span className="page-state-icon" aria-hidden="true">
        <Icon className={kind === 'loading' ? 'animate-spin' : undefined} size={24} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {actionLabel && onAction ? (
          <button className="page-state-action" onClick={onAction} type="button">
            <RefreshCcw size={15} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  )
}
