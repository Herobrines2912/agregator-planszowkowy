import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AlertSubscribeForm } from './AlertSubscribeForm'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AlertSubscribeForm', () => {
  test('1. Renders "Ustaw alert" trigger button, modal not open by default', () => {
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    expect(screen.getByTestId('ustaw-alert-btn')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('2. Clicking trigger button opens modal with State 1 form', () => {
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Ustaw alert cenowy')).toBeInTheDocument()
  })

  test('3. State 1: all form elements present with correct defaults', () => {
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    expect(screen.getByTestId('email-input')).toBeInTheDocument()
    expect(screen.getByTestId('price-input')).toBeInTheDocument()
    expect(screen.getByTestId('price-slider')).toBeInTheDocument()
    expect(screen.getByTestId('type-b-checkbox')).toBeChecked()
    expect(screen.getByTestId('consent-checkbox')).not.toBeChecked()
    expect(screen.getByTestId('age-checkbox')).not.toBeChecked()
    expect(screen.getByTestId('submit-btn')).toBeInTheDocument()
  })

  test('4. Close button (×) closes modal', () => {
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('modal-close-btn'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('5. Escape key closes modal', () => {
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('6. Submit without consent → error shown, no fetch called', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'test@example.com' } })
    // consent NOT checked (default false)
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(screen.getByTestId('form-error')).toHaveTextContent(
      'Zgoda na przetwarzanie danych jest wymagana'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('7. Submit without age check → error shown, no fetch called', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByTestId('consent-checkbox'))
    // age NOT checked (default false)
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(screen.getByTestId('form-error')).toHaveTextContent(
      'Wymagane potwierdzenie wieku (16+)'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('8. Submit with invalid email → error shown, no fetch called', () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'invalid-email' } })
    fireEvent.click(screen.getByTestId('consent-checkbox'))
    fireEvent.click(screen.getByTestId('age-checkbox'))
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(screen.getByTestId('form-error')).toHaveTextContent('Nieprawidłowy adres e-mail')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('9. Valid submit → fetch called with correct URL and body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { message: 'OK' } }),
    } as unknown as Response)

    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByTestId('consent-checkbox'))
    fireEvent.click(screen.getByTestId('age-checkbox'))
    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/alerts/subscribe')
    const body = JSON.parse(options.body as string)
    expect(body).toMatchObject({
      email: 'test@example.com',
      targetPrice: '150.00',
      typeBEnabled: true,
      consentGiven: true,
      ageConfirmed: true,
      gameSlug: 'brass-birmingham',
    })
  })

  test('10. POST success → transitions to State 2 (Pending DOI), email input hidden', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { message: 'OK' } }),
    } as unknown as Response)

    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByTestId('consent-checkbox'))
    fireEvent.click(screen.getByTestId('age-checkbox'))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(
      await screen.findByText('Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('email-input')).not.toBeInTheDocument()
  })

  test('11. POST error → error message shown, still in State 1', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({ success: false, error: 'Ten email jest już zarejestrowany' }),
    } as unknown as Response)

    render(<AlertSubscribeForm gameSlug="brass-birmingham" gameName="Brass: Birmingham" />)
    fireEvent.click(screen.getByTestId('ustaw-alert-btn'))
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByTestId('consent-checkbox'))
    fireEvent.click(screen.getByTestId('age-checkbox'))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'Ten email jest już zarejestrowany'
    )
    expect(screen.getByTestId('email-input')).toBeInTheDocument()
  })

  test('12. initialState="success" prop → State 3 shown immediately', () => {
    render(
      <AlertSubscribeForm
        gameSlug="brass-birmingham"
        gameName="Brass: Birmingham"
        initialState="success"
      />
    )
    expect(screen.getByText('Powiadomienie aktywne!')).toBeInTheDocument()
    expect(screen.getByText('AKTYWNY')).toBeInTheDocument()
    expect(screen.getByText('Brass: Birmingham')).toBeInTheDocument()
  })
})
