'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { formatPrice, formatDateMedium } from '@/lib/format'
import { TimeRangeSelector, type Range, RANGE_DAYS, ALL_RANGES } from './TimeRangeSelector'
import type { ApiResponse } from '@/types/api'

export interface PriceDataPoint {
  date: string       // ISO date string "YYYY-MM-DD"
  storeId: number
  storeName: string
  price: string      // Decimal→string from DB, e.g. "89.99"
}

export interface PriceChartProps {
  data: PriceDataPoint[]
  gameId: number
  initialRange?: Range
}

const STORE_COLORS = ['#3D5C3A', '#C4622D', '#C07B18', '#6B5744', '#8B6C4F']

// SVG coordinate system: ViewBox 0 0 860 280, plotting area x:60–820, y:20–220
const PLOT_X_MIN = 60
const PLOT_X_MAX = 820
const PLOT_Y_MIN = 20
const PLOT_Y_MAX = 220
const PLOT_W = PLOT_X_MAX - PLOT_X_MIN  // 760
const PLOT_H = PLOT_Y_MAX - PLOT_Y_MIN  // 200

function xPos(date: Date, minDate: Date, maxDate: Date): number {
  const range = maxDate.getTime() - minDate.getTime()
  if (range === 0) return PLOT_X_MIN + PLOT_W / 2
  return PLOT_X_MIN + ((date.getTime() - minDate.getTime()) / range) * PLOT_W
}

function yPos(price: number, minP: number, maxP: number): number {
  const range = maxP - minP
  if (range === 0) return (PLOT_Y_MIN + PLOT_Y_MAX) / 2
  return PLOT_Y_MAX - ((price - minP) / range) * PLOT_H
}

function buildLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length <= 1) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

function filterByRange(data: PriceDataPoint[], range: Range): PriceDataPoint[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range])
  cutoff.setHours(0, 0, 0, 0)
  return data.filter(d => new Date(d.date) >= cutoff)
}

// `loadedRangeDays` is how far back the currently-held `data` was actually fetched for.
// Ranges within that window are locked/unlocked based on the real data span (as before).
// Ranges beyond it (wider than what's loaded) can't be judged yet — treat them as
// unlocked so a click can fetch and find out, rather than falsely locking a range
// that may well have data. See Story 5.3 Dev Notes — "Unlock Heuristic for
// Partially-Loaded Data".
function computeUnlockedRanges(data: PriceDataPoint[], loadedRangeDays: number): Set<Range> {
  const unlocked = new Set<Range>()
  const dates = data.map(d => new Date(d.date).getTime())
  const minTs = dates.length > 0 ? Math.min(...dates) : null
  const spanDays = minTs !== null ? (Date.now() - minTs) / (1000 * 60 * 60 * 24) : 0

  for (const range of ALL_RANGES) {
    const days = RANGE_DAYS[range]
    if (days > loadedRangeDays || spanDays >= days) unlocked.add(range)
  }
  // Always unlock 1T as the minimum useful range
  unlocked.add('1T')
  return unlocked
}

interface StoreGroup {
  storeId: number
  storeName: string
  colorIndex: number
  points: { x: number; y: number; date: Date; price: number }[]
}

function buildStoreGroups(
  filteredData: PriceDataPoint[],
  storeOrder: number[],
  minDate: Date,
  maxDate: Date,
  minP: number,
  maxP: number,
): StoreGroup[] {
  const grouped = new Map<number, StoreGroup>()

  for (const d of filteredData) {
    if (!grouped.has(d.storeId)) {
      const colorIndex = storeOrder.indexOf(d.storeId)
      grouped.set(d.storeId, {
        storeId: d.storeId,
        storeName: d.storeName,
        colorIndex: colorIndex >= 0 ? colorIndex : grouped.size,
        points: [],
      })
    }
    grouped.get(d.storeId)!.points.push({
      x: xPos(new Date(d.date), minDate, maxDate),
      y: yPos(parseFloat(d.price), minP, maxP),
      date: new Date(d.date),
      price: parseFloat(d.price),
    })
  }

  // Sort each store's points by date ascending
  for (const group of grouped.values()) {
    group.points.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  // Return in stable insertion order (storeOrder)
  return storeOrder
    .filter(id => grouped.has(id))
    .map(id => grouped.get(id)!)
}

function computeStats(filteredData: PriceDataPoint[], range: Range) {
  if (filteredData.length === 0) return null

  const priceEntries = filteredData.map(d => ({ price: parseFloat(d.price), date: d.date }))
  const min = priceEntries.reduce((a, b) => a.price < b.price ? a : b)
  const newest = filteredData.reduce((a, b) => a.date > b.date ? a : b)

  const cutoff30 = new Date()
  cutoff30.setDate(cutoff30.getDate() - 30)
  cutoff30.setHours(0, 0, 0, 0)
  const last30 = filteredData.filter(d => new Date(d.date) >= cutoff30)

  const avg30 = last30.length >= 7
    ? last30.reduce((sum, d) => sum + parseFloat(d.price), 0) / last30.length
    : null

  const showAvg = !(range === '1M' && last30.length < 7) && avg30 !== null

  return {
    min: { price: min.price.toFixed(2), date: min.date },
    current: newest.price,
    avg30: showAvg ? avg30!.toFixed(2) : null,
  }
}

function xAxisLabels(
  uniqueDates: Date[],
  minDate: Date,
  maxDate: Date,
  isMobile: boolean,
): { x: number; label: string }[] {
  if (uniqueDates.length === 0) return []
  const maxLabels = isMobile ? 4 : 7
  const step = Math.max(1, Math.ceil(uniqueDates.length / maxLabels))
  return uniqueDates
    .filter((_, i) => i % step === 0)
    .map(d => ({
      x: xPos(d, minDate, maxDate),
      label: isMobile
        ? d.toLocaleDateString('pl-PL', { month: 'short' })
        : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),
    }))
}

function yAxisLabels(
  minP: number,
  maxP: number,
  count = 4,
): { y: number; label: string }[] {
  if (minP === maxP) {
    return [{ y: (PLOT_Y_MIN + PLOT_Y_MAX) / 2, label: formatPrice(minP.toFixed(2)) }]
  }
  const step = (maxP - minP) / (count - 1)
  return Array.from({ length: count }, (_, i) => {
    const price = minP + step * i
    return {
      y: yPos(price, minP, maxP),
      label: formatPrice(price.toFixed(2)),
    }
  })
}

interface TooltipState {
  svgX: number
  svgY: number
  storeName: string
  price: string
  date: string
}

export function PriceChart({ data, gameId, initialRange = '1T' }: PriceChartProps) {
  // `chartData` starts as whatever was passed in (server-fetched for `initialRange`);
  // it's replaced wholesale when a range wider than `loadedRangeDays` is selected (AC-2).
  const [chartData, setChartData] = useState<PriceDataPoint[]>(data)
  const [loadedRangeDays, setLoadedRangeDays] = useState<number>(RANGE_DAYS[initialRange])
  const [loading, setLoading] = useState(false)

  const availableRanges = computeUnlockedRanges(chartData, loadedRangeDays)

  // Pick best default range from what's unlocked
  const defaultRange: Range = availableRanges.has(initialRange)
    ? initialRange
    : (ALL_RANGES.find(r => availableRanges.has(r)) ?? '1T')

  const [selectedRange, setSelectedRange] = useState<Range>(defaultRange)

  // The range currently being viewed must stay visually available: once a wider
  // fetch resolves, its real span may be too short to "unlock" it by the heuristic,
  // which would otherwise render the active button as disabled with a misleading
  // "collect N days" tooltip even though its data is already loaded and on screen.
  const unlockedRanges = new Set(availableRanges).add(selectedRange)
  const [hiddenStores, setHiddenStores] = useState<Set<number>>(new Set())
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Abort any in-flight range fetch on unmount
  useEffect(() => {
    return () => fetchAbortRef.current?.abort()
  }, [])

  const handleRangeChange = useCallback(async (range: Range) => {
    setSelectedRange(range)
    setHiddenStores(new Set())

    if (RANGE_DAYS[range] <= loadedRangeDays) return // already covered by loaded data — client-side filter only

    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller
    // Hard timeout so a stalled connection can't leave the shimmer up until the
    // browser's own (minutes-long) network timeout — same shape as AlertSubscribeForm.
    const timeout = setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    try {
      const res = await fetch(`/api/price-history?gameId=${gameId}&range=${range}`, {
        signal: controller.signal,
      })
      const body: ApiResponse<PriceDataPoint[]> = await res.json()
      if (body.success) {
        setChartData(body.data)
        setLoadedRangeDays(RANGE_DAYS[range])
      } else {
        console.error('[PriceChart] price-history fetch failed', body.error)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[PriceChart] price-history fetch failed', err)
      }
    } finally {
      clearTimeout(timeout)
      if (fetchAbortRef.current === controller) {
        setLoading(false)
      }
    }
  }, [gameId, loadedRangeDays])

  // Stable store insertion order — derived synchronously from currently-loaded data
  const storeOrder = useMemo(() => {
    const seen = new Set<number>()
    const order: number[] = []
    for (const d of chartData) {
      if (!seen.has(d.storeId)) {
        order.push(d.storeId)
        seen.add(d.storeId)
      }
    }
    return order
  }, [chartData])

  const filteredData = filterByRange(chartData, selectedRange)

  // Compute price/date bounds from filtered data
  const allPrices = filteredData.map(d => parseFloat(d.price))
  const allDates = filteredData.map(d => new Date(d.date).getTime())
  const minP = allPrices.length > 0 ? Math.min(...allPrices) : 0
  const maxP = allPrices.length > 0 ? Math.max(...allPrices) : 100
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date()
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date()

  // Pad y range slightly so lines don't sit on the edge
  const pricePad = (maxP - minP) * 0.1 || 5
  const paddedMinP = Math.max(0, minP - pricePad)
  const paddedMaxP = maxP + pricePad

  const storeGroups = buildStoreGroups(
    filteredData,
    storeOrder,
    minDate,
    maxDate,
    paddedMinP,
    paddedMaxP,
  )

  const uniqueDates = Array.from(
    new Map(filteredData.map(d => [d.date, new Date(d.date)])).values()
  ).sort((a, b) => a.getTime() - b.getTime())

  const xLabels = xAxisLabels(uniqueDates, minDate, maxDate, isMobile)
  const yLabels = yAxisLabels(paddedMinP, paddedMaxP)
  const stats = computeStats(filteredData, selectedRange)

  function toggleStore(storeId: number) {
    const visibleCount = storeGroups.length - hiddenStores.size
    const isLastVisible = visibleCount === 1 && !hiddenStores.has(storeId)
    if (isLastVisible) return
    setHiddenStores(prev => {
      const next = new Set(prev)
      if (next.has(storeId)) next.delete(storeId)
      else next.add(storeId)
      return next
    })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = 860 / rect.width
    const scaleY = 280 / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY

    let nearest: TooltipState | null = null
    let minDist = Infinity

    for (const store of storeGroups) {
      if (hiddenStores.has(store.storeId)) continue
      for (const pt of store.points) {
        const dist = Math.sqrt((mx - pt.x) ** 2 + (my - pt.y) ** 2)
        if (dist < minDist) {
          minDist = dist
          nearest = {
            svgX: pt.x,
            svgY: pt.y,
            storeName: store.storeName,
            price: formatPrice(pt.price.toFixed(2)),
            date: formatDateMedium(pt.date),
          }
        }
      }
    }

    if (nearest && minDist < 40) {
      setTooltip(nearest)
    } else {
      setTooltip(null)
    }
  }, [storeGroups, hiddenStores])

  // Tooltip pixel position from SVG coords
  function tooltipPixelPos(svgX: number, svgY: number, containerWidth: number) {
    const pctX = (svgX - 0) / 860
    const pctY = (svgY - 0) / 280
    const svgHeight = isMobile ? 220 : 280
    let px = pctX * containerWidth
    let py = pctY * svgHeight
    const tw = tooltipRef.current?.offsetWidth ?? 120
    if (px + tw + 12 > containerWidth) px = px - tw - 12
    else px = px + 12
    py = py - 30
    return { px, py }
  }

  const svgHeight = isMobile ? 220 : 280
  const isEmpty = filteredData.length === 0

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      {/* Header: range selector + legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        <TimeRangeSelector
          selected={selectedRange}
          unlockedRanges={unlockedRanges}
          onChange={handleRangeChange}
        />

        {/* Legend */}
        {storeGroups.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {storeGroups.map((store) => {
              const visibleCount = storeGroups.length - hiddenStores.size
              const isLastVisible = visibleCount === 1 && !hiddenStores.has(store.storeId)
              return (
                <button
                  key={store.storeId}
                  onClick={() => toggleStore(store.storeId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: isLastVisible ? 'not-allowed' : 'pointer',
                    opacity: hiddenStores.has(store.storeId) ? 0.4 : 1,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      background: STORE_COLORS[store.colorIndex] ?? '#6B5744',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#6B5744' }}>{store.storeName}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Chart area */}
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox="0 0 860 280"
          width="100%"
          height={svgHeight}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          style={{ display: 'block', overflow: 'visible' }}
          aria-label="Wykres historii cen"
          role="img"
        >
          {/* Chart background */}
          <rect
            x={PLOT_X_MIN}
            y={PLOT_Y_MIN}
            width={PLOT_W}
            height={PLOT_H}
            fill="#F2EAD8"
          />

          {/* Horizontal grid lines */}
          {yLabels.map((yl, i) => (
            <line
              key={i}
              x1={PLOT_X_MIN}
              y1={yl.y}
              x2={PLOT_X_MAX}
              y2={yl.y}
              stroke="#D4C4AE"
              strokeOpacity={0.2}
              strokeWidth={1}
            />
          ))}

          {/* Y-axis labels */}
          {yLabels.map((yl, i) => (
            <text
              key={i}
              x={PLOT_X_MIN - 6}
              y={yl.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="#A89480"
            >
              {yl.label}
            </text>
          ))}

          {/* X-axis labels */}
          {xLabels.map((xl, i) => (
            <text
              key={i}
              x={xl.x}
              y={PLOT_Y_MAX + 18}
              textAnchor="middle"
              fontSize={11}
              fill="#A89480"
            >
              {xl.label}
            </text>
          ))}

          {/* Empty state inside SVG */}
          {isEmpty && (
            <text
              x={PLOT_X_MIN + PLOT_W / 2}
              y={(PLOT_Y_MIN + PLOT_Y_MAX) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fill="#A89480"
            >
              Za mało danych dla wybranego zakresu — wybierz dłuższy okres
            </text>
          )}

          {/* Store lines */}
          {!isEmpty && storeGroups.map((store) => {
            if (hiddenStores.has(store.storeId)) return null
            const color = STORE_COLORS[store.colorIndex] ?? '#6B5744'
            const pathD = buildLinePath(store.points)
            const delay = store.colorIndex === 0 ? 0.3 : 0.5

            // Single point: render a dot
            if (store.points.length === 1) {
              const pt = store.points[0]
              return (
                <circle
                  key={`${store.storeId}-dot-${selectedRange}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={4}
                  fill={color}
                />
              )
            }

            return (
              <path
                key={`${store.storeId}-${selectedRange}`}
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 1,
                  animation: `chartDraw 1.4s ease forwards`,
                  animationDelay: `${delay}s`,
                }}
              />
            )
          })}

          {/* Tooltip dot indicator */}
          {tooltip && (
            <circle
              cx={tooltip.svgX}
              cy={tooltip.svgY}
              r={4}
              fill="white"
              stroke="#2C1F14"
              strokeWidth={1.5}
            />
          )}
        </svg>

        {/* Loading overlay — shown only while re-fetching a wider range (AC-2); TimeRangeSelector/legend stay outside this and remain interactive */}
        {loading && (
          <div
            className="shimmer-box"
            role="status"
            aria-label="Wczytywanie danych wykresu"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: svgHeight,
              borderRadius: '8px',
            }}
          />
        )}

        {/* Tooltip overlay */}
        {tooltip && (() => {
          const containerEl = svgRef.current?.parentElement
          const containerW = containerEl?.clientWidth ?? 860
          const { px, py } = tooltipPixelPos(tooltip.svgX, tooltip.svgY, containerW)
          return (
            <div
              ref={tooltipRef}
              style={{
                position: 'absolute',
                top: py,
                left: px,
                background: '#DDD0BC',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(44,31,20,0.16)',
                padding: '8px 12px',
                fontSize: '13px',
                color: '#2C1F14',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>{tooltip.price}</div>
              <div style={{ color: '#6B5744' }}>{tooltip.storeName}</div>
              <div style={{ color: '#A89480', fontSize: '11px' }}>{tooltip.date}</div>
            </div>
          )
        })()}
      </div>

      {/* Statistics section */}
      {stats && (
        <div
          style={{
            display: 'flex',
            gap: '24px',
            marginTop: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '12px', color: '#A89480', marginBottom: '4px' }}>Najniższa</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#2C1F14' }}>
              {formatPrice(stats.min.price)}
              <span style={{ fontSize: '12px', color: '#A89480', fontWeight: 400, marginLeft: '6px' }}>
                · {formatDateMedium(stats.min.date)}
              </span>
            </div>
          </div>

          {stats.avg30 !== null && (
            <div>
              <div style={{ fontSize: '12px', color: '#A89480', marginBottom: '4px' }}>Średnia 30d</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#2C1F14' }}>
                {formatPrice(stats.avg30)}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: '12px', color: '#A89480', marginBottom: '4px' }}>Aktualna</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#2C1F14' }}>
              {formatPrice(stats.current)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
