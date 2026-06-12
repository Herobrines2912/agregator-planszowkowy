'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type SortOption = 'discount' | 'price-asc' | 'price-desc' | 'popularity'

const SORT_LABELS: Record<SortOption, string> = {
  discount: 'Rabat ↓',
  'price-asc': 'Cena rosnąco',
  'price-desc': 'Cena malejąco',
  popularity: 'Popularność',
}

const TYPE_LABELS: Record<string, string> = {
  base: 'Gra bazowa',
  expansion: 'Dodatek',
}

export interface FilterBarProps {
  resultCount: number
}

export function FilterBar({ resultCount }: FilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const typeParam = searchParams.get('type')
  const playersParam = searchParams.get('players')
  const viewParam = searchParams.get('view') ?? 'cards'
  const sortParam = (searchParams.get('sort') ?? 'discount') as SortOption

  const activeTags: { key: string; label: string }[] = []
  if (typeParam) activeTags.push({ key: 'type', label: TYPE_LABELS[typeParam] ?? typeParam })
  if (playersParam) activeTags.push({ key: 'players', label: `Dla ${playersParam} graczy` })

  const filterCount = activeTags.length

  function removeFilter(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '?')
  }

  function setSort(sort: SortOption) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sort)
    router.replace(`?${params.toString()}`)
  }

  function setView(view: 'cards' | 'list') {
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'cards') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '?')
  }

  return (
    <div
      data-testid="filter-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '12px 0',
        marginBottom: '16px',
      }}
    >
      {/* Przycisk Filtry — w MVP tylko wizualny wskaźnik count */}
      <button
        data-testid="filtry-button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 14px',
          borderRadius: '8px',
          border: '1.5px solid #3D5C3A',
          backgroundColor: 'transparent',
          color: '#3D5C3A',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Filtry
        {filterCount > 0 && (
          <span
            data-testid="filter-count-bubble"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#3D5C3A',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {filterCount}
          </span>
        )}
      </button>

      {/* Aktywne tagi filtrów */}
      {activeTags.map((tag) => (
        <span
          key={tag.key}
          data-testid={`filter-tag-${tag.key}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '20px',
            backgroundColor: '#3D5C3A',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {tag.label}
          <button
            data-testid={`remove-filter-${tag.key}`}
            onClick={() => removeFilter(tag.key)}
            aria-label={`Usuń filtr ${tag.label}`}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '0',
              fontSize: '14px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}

      {/* Licznik wyników */}
      <span
        data-testid="result-count"
        style={{ fontSize: '13px', color: '#6B5744' }}
      >
        — {resultCount} okazji
      </span>

      {/* Separator */}
      <div style={{ flex: 1 }} />

      {/* Sort dropdown */}
      <select
        data-testid="sort-dropdown"
        value={sortParam}
        onChange={(e) => setSort(e.target.value as SortOption)}
        style={{
          padding: '7px 12px',
          borderRadius: '8px',
          border: '1px solid #D4C4AE',
          backgroundColor: '#DDD0BC',
          color: '#2C1F14',
          fontSize: '13px',
          cursor: 'pointer',
        }}
      >
        {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* View toggle Karty / Lista */}
      <div
        data-testid="view-toggle"
        style={{
          display: 'flex',
          borderRadius: '8px',
          border: '1px solid #D4C4AE',
          overflow: 'hidden',
        }}
      >
        <button
          data-testid="view-cards"
          onClick={() => setView('cards')}
          style={{
            padding: '7px 14px',
            border: 'none',
            backgroundColor: viewParam === 'cards' ? '#3D5C3A' : 'transparent',
            color: viewParam === 'cards' ? '#fff' : '#6B5744',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Karty
        </button>
        <button
          data-testid="view-list"
          onClick={() => setView('list')}
          style={{
            padding: '7px 14px',
            border: 'none',
            backgroundColor: viewParam === 'list' ? '#3D5C3A' : 'transparent',
            color: viewParam === 'list' ? '#fff' : '#6B5744',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Lista
        </button>
      </div>
    </div>
  )
}
