import { useState } from 'react'
import { api } from '../api/rendererApi'
import { formatBytes } from '../formatBytes'

interface Node {
  path: string
  label: string
  bytes: number
}

async function fetchChildren(path: string): Promise<Node[]> {
  const results = await api.disk.listFolderChildren(path)
  return results.map((r) => ({ path: r.key, label: r.label, bytes: r.bytes }))
}

function TreeNode({ node, depth }: { node: Node; depth: number }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<Node[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle(): Promise<void> {
    if (!expanded && children === null) {
      setLoading(true)
      const result = await fetchChildren(node.path)
      setChildren(result)
      setLoading(false)
    }
    setExpanded((e) => !e)
  }

  return (
    <li>
      <div className="folder-explorer__row" style={{ paddingLeft: depth * 14 }} onClick={toggle}>
        <span className="folder-explorer__toggle">
          {loading ? <span className="spinner" /> : expanded ? '▾' : '▸'}
        </span>
        <span className="folder-explorer__label" title={node.path}>
          {node.label}
        </span>
        <span className="folder-explorer__bytes">{formatBytes(node.bytes)}</span>
      </div>
      {expanded && children && (
        <ul className="folder-explorer__children">
          {children.length === 0 ? (
            <li className="folder-explorer__empty" style={{ paddingLeft: (depth + 1) * 14 }}>
              — leer oder kein Zugriff —
            </li>
          ) : (
            children.map((c) => <TreeNode key={c.path} node={c} depth={depth + 1} />)
          )}
        </ul>
      )}
    </li>
  )
}

interface Props {
  driveLetter: string
  root: { key: string; label: string; bytes: number }[]
  /** True while the overview scan (and therefore `root`) is being (re)computed —
   * distinguishes "not measured yet" from a genuinely empty/inaccessible root. */
  loading: boolean
}

function Skeleton(): JSX.Element {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="folder-explorer__skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
          <span className="folder-explorer__skeleton-bar" style={{ width: `${70 - i * 8}%` }} />
        </li>
      ))}
    </>
  )
}

/** Root listing arrives precomputed as part of the main disk-overview scan
 * (see DiskOverview.rootFolders) — shown immediately, no separate fetch.
 * Drilling into a subfolder still fetches its children on demand, since
 * eagerly sizing the whole tree upfront would be the slow, unbounded scan
 * this component used to trigger behind a button. */
export function FolderExplorer({ driveLetter, root, loading }: Props): JSX.Element {
  const [open, setOpen] = useState(true)
  const nodes: Node[] = root.map((r) => ({ path: r.key, label: r.label, bytes: r.bytes }))

  return (
    <div className="folder-explorer">
      <button className="btn btn--ghost btn--small" onClick={() => setOpen((o) => !o)}>
        <span className="folder-explorer__button-icon">🔍</span>
        Speicherplatz erkunden ({driveLetter}\)
      </button>
      {open && (
        <ul className="folder-explorer__tree">
          {nodes.length === 0 && loading ? (
            <Skeleton />
          ) : nodes.length === 0 ? (
            <li className="folder-explorer__empty">— leer oder kein Zugriff —</li>
          ) : (
            nodes.map((n) => <TreeNode key={n.path} node={n} depth={0} />)
          )}
        </ul>
      )}
    </div>
  )
}
