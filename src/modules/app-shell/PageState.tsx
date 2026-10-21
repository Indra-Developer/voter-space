import { Inbox, LoaderCircle, RefreshCcw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { joinClasses, uiClasses } from './ui'

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
    <section className={joinClasses('page-state page-state-' + kind, uiClasses.card, 'flex min-h-32 items-start gap-3 p-4')} aria-live="polite">
      <span className={joinClasses('page-state-icon', uiClasses.iconBadge)} aria-hidden="true">
        <Icon className={kind === 'loading' ? 'animate-spin' : undefined} size={24} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {actionLabel && onAction ? (
          <button className={joinClasses('page-state-action', uiClasses.button, uiClasses.secondaryButton, 'mt-3')} onClick={onAction} type="button">
            <RefreshCcw size={15} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  )
}
