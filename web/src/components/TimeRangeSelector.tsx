'use client'

import { type Range, RANGE_DAYS, ALL_RANGES } from '@/lib/price-range'

export interface TimeRangeSelectorProps {
  selected: Range
  unlockedRanges: Set<Range>
  onChange: (range: Range) => void
}

export function TimeRangeSelector({ selected, unlockedRanges, onChange }: TimeRangeSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {ALL_RANGES.map((range) => {
        const isActive = range === selected
        const isUnlocked = unlockedRanges.has(range)
        const daysNeeded = RANGE_DAYS[range]

        const activeStyle = {
          background: '#3D5C3A',
          color: '#FFFFFF',
          border: '1.5px solid #3D5C3A',
          cursor: 'pointer',
        }
        const inactiveStyle = {
          background: 'transparent',
          color: '#6B5744',
          border: '1.5px solid #D4C4AE',
          cursor: 'pointer',
        }
        const disabledStyle = {
          background: 'transparent',
          color: '#A89480',
          border: '1px solid #E0D5C5',
          cursor: 'not-allowed',
        }

        const buttonStyle = isUnlocked
          ? isActive ? activeStyle : inactiveStyle
          : disabledStyle

        return (
          <span
            key={range}
            title={!isUnlocked ? `Dostępne po zebraniu ${daysNeeded} dni danych` : undefined}
          >
            <button
              onClick={() => isUnlocked && onChange(range)}
              disabled={!isUnlocked}
              aria-pressed={isActive}
              style={{
                ...buttonStyle,
                borderRadius: '20px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 400,
                fontFamily: 'inherit',
                lineHeight: 1,
              }}
            >
              {range}
            </button>
          </span>
        )
      })}
    </div>
  )
}
