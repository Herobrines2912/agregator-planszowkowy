import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ListRowSkeleton } from './ListRowSkeleton'

describe('ListRowSkeleton', () => {
  test('renderuje się bez błędów', () => {
    const { container } = render(<ListRowSkeleton />)
    expect(container.firstChild).not.toBeNull()
  })

  test('renderuje element li', () => {
    const { container } = render(<ListRowSkeleton />)
    expect(container.querySelector('li')).not.toBeNull()
  })

  test('zawiera elementy z klasą shimmer-box', () => {
    const { container } = render(<ListRowSkeleton />)
    const shimmerBoxes = container.querySelectorAll('.shimmer-box')
    expect(shimmerBoxes.length).toBeGreaterThanOrEqual(5)
  })

  test('thumbnail ma wymiary 48x48px', () => {
    const { container } = render(<ListRowSkeleton />)
    const thumbnail = container.querySelector('.shimmer-box') as HTMLElement
    expect(thumbnail.style.width).toBe('48px')
    expect(thumbnail.style.height).toBe('48px')
  })

  test('row ma border-radius 10px', () => {
    const { container } = render(<ListRowSkeleton />)
    const li = container.querySelector('li') as HTMLElement
    expect(li.style.borderRadius).toBe('10px')
  })
})
