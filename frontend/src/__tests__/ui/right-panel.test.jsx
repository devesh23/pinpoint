import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from '../../components/RightPanel'
import { renderWithProviders } from '../../test-utils'

describe('RightPanel', () => {
  it('renders tabs and toggles controls, calling setters', async () => {
    const setShowDebug = vi.fn()
    const onMockAnchors = vi.fn()
    const setShowMiniMap = vi.fn()

    renderWithProviders(
      <RightPanel
        open={true}
        onClose={() => { }}
        anchors={[{ beaconId: 'a', x: 0, y: 0 }]}
        employees={[{ id: 'd1', label: 'Dev', x: 0.1, y: 0.2 }]}
        logs={['log1', 'log2']}
        debugInfo={{ foo: 'bar' }}
        frameCount={5}
        showDebug={false}
        setShowDebug={setShowDebug}
        onMockAnchors={onMockAnchors}
        anchorMode={false}
        setAnchorMode={() => { }}
        showMiniMap={false}
        setShowMiniMap={setShowMiniMap}
      />
    )

    // Switch to Controls tab
    await userEvent.click(await screen.findByRole('tab', { name: /Controls/i }))
    // Toggle checkboxes
    const showDebugCb = screen.getByLabelText(/Show floating debug overlay/i)
    const miniCb = screen.getByLabelText(/Show mini map/i)
    await userEvent.click(showDebugCb)
    await userEvent.click(miniCb)
    expect(setShowDebug).toHaveBeenCalled()
    expect(setShowMiniMap).toHaveBeenCalled()

    // Click Mock Anchors button
    await userEvent.click(screen.getByRole('button', { name: /Mock Anchors/i }))
    expect(onMockAnchors).toHaveBeenCalled()

    // Switch to Devices tab and check table
    await userEvent.click(screen.getByRole('tab', { name: /Devices/i }))
    expect(screen.getByText('Dev')).toBeInTheDocument()
  })
})
