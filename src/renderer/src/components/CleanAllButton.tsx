interface Props {
  onClick(): void
  running: boolean
}

export function CleanAllButton({ onClick, running }: Props): JSX.Element {
  return (
    <button className="btn btn--primary" onClick={onClick} disabled={running}>
      {running ? 'Läuft…' : 'Alles bereinigen'}
    </button>
  )
}
