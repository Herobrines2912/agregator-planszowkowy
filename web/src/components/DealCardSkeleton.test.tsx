import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DealCardSkeleton } from './DealCardSkeleton'

describe('DealCardSkeleton', () => {
  test('renderuje się bez błędów', () => {
    const { container } = render(<DealCardSkeleton />)
    expect(container.firstChild).not.toBeNull()
  })

  test('zawiera elementy z klasą shimmer-box', () => {
    const { container } = render(<DealCardSkeleton />)
    const shimmerBoxes = container.querySelectorAll('.shimmer-box')
    expect(shimmerBoxes.length).toBeGreaterThanOrEqual(4)
  })

  test('area obrazka ma wysokość 148px', () => {
    const { container } = render(<DealCardSkeleton />)
    const imageArea = container.querySelector('.shimmer-box') as HTMLElement
    expect(imageArea.style.height).toBe('148px')
  })

  test('wrapper ma border-radius 12px', () => {
    const { container } = render(<DealCardSkeleton />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.borderRadius).toBe('12px')
  })
})
