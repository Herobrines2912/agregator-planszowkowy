export function ListRowSkeleton() {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '10px',
        listStyle: 'none',
      }}
    >
      <div className="shimmer-box" style={{ width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div className="shimmer-box" style={{ height: '15px', width: '60%' }} />
        <div className="shimmer-box" style={{ height: '12px', width: '30%' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div className="shimmer-box" style={{ width: '36px', height: '20px' }} />
        <div className="shimmer-box" style={{ width: '52px', height: '20px' }} />
        <div className="shimmer-box" style={{ width: '72px', height: '32px', borderRadius: '7px' }} />
      </div>
    </li>
  )
}
