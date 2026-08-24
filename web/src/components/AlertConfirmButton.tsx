'use client'

import { AlertTokenActionButton } from './AlertTokenActionButton'

interface AlertConfirmButtonProps {
  token: string
}

export function AlertConfirmButton({ token }: AlertConfirmButtonProps) {
  return (
    <AlertTokenActionButton
      token={token}
      endpoint="/api/alerts/confirm"
      successPath="/alerts/confirmed"
      label="Potwierdzam"
      tone="primary"
    />
  )
}
