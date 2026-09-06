interface Props {
  onClick(): void
  loading: boolean
  label?: string
}

export function RefreshButton({ onClick, loading, label = 'Aktualisieren' }: Props): JSX.Element {
  return (
    <button className="btn btn--ghost" onClick={onClick} disabled={loading} title="Speicherplatz-Ermittlung neu anstoßen">
      {loading ? '…' : '⟳'} {label}
    </button>
  )
}
