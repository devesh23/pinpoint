import React from 'react'
import { waitFor } from '@testing-library/react'
import App from '../../App'
import { renderWithProviders } from '../../test-utils'

// Create a minimal ReadableStream-like stub for SSE
function makeSSEOkResponse(){
  return {
    ok: true,
    body: {
      getReader(){
        return {
          read: async ()=> ({ done: true, value: undefined })
        }
      }
    }
  }
}

describe('App mock pollUrl defaults', () => {
  afterEach(()=>{
    vi.restoreAllMocks()
    // clear localStorage keys used by App
    localStorage.clear()
  })

  it('builds mock stream URL with default noise/outlier params', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      // First call: config.json
      .mockResolvedValueOnce({ ok: true, json: async ()=> ({ backendPort: 8080 }) })
      // Second call: SSE connect to pollUrl
      .mockResolvedValueOnce(makeSSEOkResponse())

  renderWithProviders(<App />)

    await waitFor(()=>{
      // We expect at least 2 calls: config and stream
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const url = fetchSpy.mock.calls[1][0]
      expect(String(url)).toContain('/mock/stream')
      expect(String(url)).toContain('noise=0.05')
      expect(String(url)).toContain('outlierRate=0.05')
      expect(String(url)).toContain('outlierScale=1.8')
      expect(String(url)).toContain('dropRate=0.05')
      expect(String(url)).toContain('zeroRate=0.02')
      expect(String(url)).toContain('az=1.5')
      expect(String(url)).toContain('tz=1.5')
    })
  })
})
