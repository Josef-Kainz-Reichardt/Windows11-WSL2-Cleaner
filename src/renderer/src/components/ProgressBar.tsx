interface Props {
  /** 0-100. Ignored (bar animates) when indeterminate is true. */
  value?: number
  indeterminate?: boolean
}

export function ProgressBar({ value = 0, indeterminate = false }: Props): JSX.Element {
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
    >
      <div
        className={indeterminate ? 'progress-bar__fill progress-bar__fill--indeterminate' : 'progress-bar__fill'}
        style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
