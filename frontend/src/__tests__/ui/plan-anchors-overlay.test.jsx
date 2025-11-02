import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import PlanAnchorsOverlay from '../../components/PlanAnchorsOverlay'
import { renderWithProviders } from '../../test-utils'

describe('PlanAnchorsOverlay', () => {
  function normToPercent(x, y){ return { left: x*100, top: y*100 } }
  const anchors = [
    { beaconId: '020000b3', x: 0.0, y: 0.0 },
    { beaconId: '02000053', x: 1.0, y: 0.0 },
  ]

  it('renders anchor buttons and fires onStartDrag on mousedown', () => {
    const onStartDrag = vi.fn()
  renderWithProviders(<PlanAnchorsOverlay anchors={anchors} anchorNames={{}} normToPercent={normToPercent} onStartDrag={onStartDrag} onEdit={()=>{}} onRemove={()=>{}} />)
    const buttons = screen.getAllByLabelText('drag-anchor')
    expect(buttons.length).toBe(2)
    fireEvent.mouseDown(buttons[0])
    expect(onStartDrag).toHaveBeenCalled()
  })

  it('invokes onEdit and onRemove callbacks', () => {
    const onEdit = vi.fn()
    const onRemove = vi.fn()
  renderWithProviders(<PlanAnchorsOverlay anchors={anchors} anchorNames={{}} normToPercent={normToPercent} onStartDrag={()=>{}} onEdit={onEdit} onRemove={onRemove} />)
    const editBtns = screen.getAllByLabelText('edit-anchor')
    const removeBtns = screen.getAllByLabelText('remove-anchor')
    fireEvent.click(editBtns[0])
    fireEvent.click(removeBtns[1])
    expect(onEdit).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalled()
  })
})
