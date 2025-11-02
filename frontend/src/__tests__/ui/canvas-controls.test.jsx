import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CanvasControls from '../../components/CanvasControls'
import { renderWithProviders } from '../../test-utils'

describe('CanvasControls', () => {
  it('invokes zoom and reset callbacks on click', async () => {
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const onReset = vi.fn()
    renderWithProviders(
      <CanvasControls
        image={{ type:'svg', width:1000, height:800 }}
        svgViewBox={{ x:0, y:0, w:1000, h:800 }}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onReset={onReset}
        zoomPercentText={'100%'}
      />
    )
  await userEvent.click(screen.getByTitle('Zoom In'))
  await userEvent.click(screen.getByTitle('Zoom Out'))
  await userEvent.click(screen.getByTitle('Reset view'))
    expect(onZoomIn).toHaveBeenCalled()
    expect(onZoomOut).toHaveBeenCalled()
    expect(onReset).toHaveBeenCalled()
  })
})
