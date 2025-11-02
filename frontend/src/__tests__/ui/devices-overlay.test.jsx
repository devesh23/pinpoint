import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DevicesOverlay from '../../components/DevicesOverlay'
import { renderWithProviders } from '../../test-utils'

describe('DevicesOverlay', () => {
  function normToPercent(x, y){ return { left: x*100, top: y*100 } }
  const employees = [{ id: 'dev-1', label: 'Device One', x: 0.25, y: 0.75, t: Date.now() }]

  it('renders a red circle marker with label below', async () => {
  renderWithProviders(<DevicesOverlay employees={employees} deviceNames={{}} normToPercent={normToPercent} />)
    // The label should be visible below the circle
    expect(await screen.findByText('Device One')).toBeInTheDocument()
    // Circle exists inside SVG
    const circles = document.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  it('opens a popover with details on click', async () => {
  renderWithProviders(<DevicesOverlay employees={employees} deviceNames={{}} normToPercent={normToPercent} />)
    // Click the marker wrapper (contains svg and label)
    const marker = await screen.findByText('Device One')
    await userEvent.click(marker)
    // Popover content should include Last seen and Center button
    expect(await screen.findByText(/Last seen/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Center/i })).toBeInTheDocument()
  })
})
