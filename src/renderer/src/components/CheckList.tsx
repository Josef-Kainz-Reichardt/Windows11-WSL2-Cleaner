import { useEffect, useRef } from 'react'
import { useChecksStore } from '../state/checksStore'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../categoryLabels'
import { CheckListItem } from './CheckListItem'
import type { CheckCategory, CheckDefinition } from '@shared/types'

interface CategoryToggleProps {
  category: CheckCategory
  checks: CheckDefinition[]
}

/** Bulk enable/disable checkbox for a whole category — indeterminate when only some of its checks are disabled. */
function CategoryToggle({ category, checks }: CategoryToggleProps): JSX.Element {
  const disabledCheckIds = useChecksStore((s) => s.settings.disabledCheckIds)
  const setCategoryDisabled = useChecksStore((s) => s.setCategoryDisabled)
  const ref = useRef<HTMLInputElement>(null)

  const disabledCount = checks.filter((c) => disabledCheckIds.includes(c.id)).length
  const allDisabled = disabledCount === checks.length
  const someDisabled = disabledCount > 0 && !allDisabled

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someDisabled
  }, [someDisabled])

  return (
    <input
      ref={ref}
      type="checkbox"
      className="check-list__category-toggle"
      checked={!allDisabled}
      title="Ganze Gruppe für „Alles bereinigen“ ein-/ausschalten"
      onChange={(e) => setCategoryDisabled(category, !e.target.checked)}
    />
  )
}

export function CheckList(): JSX.Element {
  const definitions = useChecksStore((s) => s.definitions)

  const byCategory = new Map<CheckCategory, typeof definitions>()
  for (const def of definitions) {
    const list = byCategory.get(def.category) ?? []
    list.push(def)
    byCategory.set(def.category, list)
  }

  return (
    <div className="check-list">
      {CATEGORY_ORDER.filter((cat) => byCategory.has(cat)).map((cat) => (
        <section key={cat} className="check-list__category">
          <h3>
            <CategoryToggle category={cat} checks={byCategory.get(cat)!} />
            {CATEGORY_LABELS[cat]}
          </h3>
          <ul>
            {byCategory.get(cat)!.map((def) => (
              <CheckListItem key={def.id} definition={def} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
