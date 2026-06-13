export default function GamePassportLoading() {
  return (
    <>
      <div
        style={{
          backgroundColor: 'var(--color-surface-header)',
          borderBottom: '1px solid var(--color-border)',
          padding: '8px 40px',
          height: '37px',
        }}
      />

      <div className="passport-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <SkeletonBox width="240px" height="240px" borderRadius="12px" />
          <SkeletonBox width="80%" height="28px" />
          <SkeletonBox width="60%" height="18px" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <SkeletonBox width="100%" height="80px" borderRadius="12px" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SkeletonBox width="100%" height="44px" borderRadius="8px" />
            <SkeletonBox width="100%" height="44px" borderRadius="8px" />
            <SkeletonBox width="100%" height="44px" borderRadius="8px" />
          </div>
        </div>
      </div>
    </>
  )
}

function SkeletonBox({
  width,
  height,
  borderRadius = '8px',
}: {
  width: string
  height: string
  borderRadius?: string
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--color-surface) 25%, var(--color-surface-header) 50%, var(--color-surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  )
}
