import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopBar } from '../../components/Layout.jsx'
import { renderWithProviders } from '../../test-utils'

describe('TopBar', () => {
  it('shows connection status and toggles mock/live switch', async () => {
    const onTogglePanel = vi.fn()
    const setUseLive = vi.fn()
    renderWithProviders(
      <TopBar
        onOpenAdmin={()=>{}}
        onNavigate={()=>{}}
        currentView={'home'}
        backendPort={8080}
        pollUrl={'http://localhost:8080/mock/stream'}
        useLive={false}
        setUseLive={setUseLive}
        connStatus={'closed'}
        onTogglePanel={onTogglePanel}
        fps={null}
        lastPacketAt={null}
        panelOpen={false}
      >
        <div>content</div>
      </TopBar>
    )
    // Status badge text present
    expect(screen.getByText(/closed/i)).toBeInTheDocument()
    // Toggle switch
    const mockLiveSwitch = screen.getByLabelText(/Mock/i)
    await userEvent.click(mockLiveSwitch)
    expect(setUseLive).toHaveBeenCalled()
    // Panel button
    await userEvent.click(screen.getByRole('button', { name: /Panel/i }))
    expect(onTogglePanel).toHaveBeenCalled()
  })
})
