import React from 'react'
import { render } from '@testing-library/react'

function Providers({ children }) {
  return (
    <>{children}</>
  )
}

export function renderWithProviders(ui, options) {
  return render(ui, { wrapper: Providers, ...options })
}
