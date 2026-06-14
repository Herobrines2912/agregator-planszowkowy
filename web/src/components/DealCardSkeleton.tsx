export function DealCardSkeleton() {
  return (
    <div
      style={{
        borderRadius: '12px',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(44,31,20,0.08)',
      }}
    >
      <div className="shimmer-box" style={{ height: '148px', borderRadius: '12px 12px 0 0' }} />
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="shimmer-box" style={{ height: '16px', width: '80%' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className="shimmer-box" style={{ height: '20px', width: '48px' }} />
          <div className="shimmer-box" style={{ height: '20px', width: '36px' }} />
        </div>
        <div className="shimmer-box" style={{ height: '36px', borderRadius: '8px' }} />
      </div>
    </div>
  )
}
