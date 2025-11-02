import React from 'react'
import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'

function Providers({ children }){
  return (
    <MantineProvider withNormalizeCSS withGlobalStyles>{children}</MantineProvider>
  )
}

export function renderWithProviders(ui, options){
  return render(ui, { wrapper: Providers, ...options })
}
