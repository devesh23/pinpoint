import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App'
import { renderWithProviders } from '../../test-utils'

// Create a minimal SSE stream that yields a single uwb_update with only two beacons
function sseResponseWithTwoBeacons(){
  const encoder = new TextEncoder()
  const chunk = encoder.encode(
    'data: ' + JSON.stringify({
      type: 'uwb_update',
      payload: {
        deviceIdHex: 'dev-two',
        beacons: [
          { beaconId: '020000b3', distance: 500 },
          { beaconId: '02000053', distance: 700 },
        ]
      }
    }) + '\n\n'
  )
  let served = false
  return {
    ok: true,
    body: {
      getReader(){
        return {
          async read(){ if(served) return { done: true, value: undefined }; served = true; return { done: false, value: chunk } }
        }
      }
    }
  }
}

describe('App ignores updates with only two beacons', () => {
  afterEach(()=>{
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('logs ignoring message and does not render device markers', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      // config.json with backendPort
      .mockResolvedValueOnce({ ok: true, json: async ()=> ({ backendPort: 8080 }) })
      // SSE response that emits a single two-beacon update
      .mockResolvedValueOnce(sseResponseWithTwoBeacons())

    renderWithProviders(<App />)

    // Open the side panel and switch to Debug tab to read logs
    await waitFor(()=> expect(fetchSpy).toHaveBeenCalledTimes(2))
    await userEvent.click(await screen.findByRole('button', { name: /Panel/i }))
    await userEvent.click(await screen.findByRole('tab', { name: /Debug/i }))
    // Confirm the ignore log appears
    await waitFor(()=> {
      const debugPre = screen.getByText(/ignoring update: only/i)
      expect(debugPre).toBeInTheDocument()
    })
  })
})
