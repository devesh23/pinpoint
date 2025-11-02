import React, { useState, useEffect } from 'react'
import * as Mantine from '@mantine/core'

export default function Admin({ anchors, setAnchors, anchorNames, setAnchorNames, deviceNames, setDeviceNames, factoryWidthMeters, factoryHeightMeters, setFactoryWidthMeters, setFactoryHeightMeters, onClose, apiKey, setApiKey, pollUrl, setPollUrl, useLive, setUseLive, smoothingMethod, setSmoothingMethod, connStatus, logs, fetchNow, clearLines, clearAllLines }){
  const [localAnchors, setLocalAnchors] = useState(anchors)
  useEffect(()=> setLocalAnchors(anchors), [anchors])

  function save(){
    setAnchors(localAnchors)
    onClose()
  }

  return (
    <div style={{ padding: 12 }}>
      <Mantine.Stack spacing="md">
        <Mantine.Group position="apart">
          <Mantine.Text weight={700} size="lg">Admin</Mantine.Text>
          <Mantine.Group>
            <Mantine.Button variant="default" onClick={onClose}>Close</Mantine.Button>
            <Mantine.Button onClick={save}>Save</Mantine.Button>
          </Mantine.Group>
        </Mantine.Group>

        <Mantine.Group grow>
          <Mantine.NumberInput label="Factory Width (m)" value={factoryWidthMeters} onChange={(v)=> setFactoryWidthMeters(v||0)} />
          <Mantine.NumberInput label="Factory Height (m)" value={factoryHeightMeters} onChange={(v)=> setFactoryHeightMeters(v||0)} />
        </Mantine.Group>

        <div>
          <Mantine.Text size="sm" weight={600}>Connection & Stream</Mantine.Text>
          <Mantine.Text color="dimmed" size="sm">Configure API key, poll URL, streaming mode and smoothing.</Mantine.Text>
          <Mantine.Group mt="sm">
            <Mantine.TextInput placeholder="API Key (optional)" value={apiKey||''} onChange={e=>setApiKey(e.target.value)} />
            <Mantine.TextInput placeholder="Poll URL" value={pollUrl||''} onChange={e=>setPollUrl(e.target.value)} sx={{ flex: 1 }} />
          </Mantine.Group>
          <Mantine.Group mt="sm">
            <Mantine.Switch label="Use Live Stream" checked={!!useLive} onChange={(e)=>setUseLive(e.currentTarget.checked)} />
            <Mantine.Select data={[{ value: 'ema', label: 'EMA (fast)' }, { value: 'kalman', label: 'Kalman (smooth)' }]} value={smoothingMethod||'ema'} onChange={(v)=>setSmoothingMethod(v)} style={{ width: 220 }} />
            <Mantine.Button onClick={fetchNow}>Fetch Now</Mantine.Button>
            <Mantine.Button variant="light" onClick={clearLines}>Clear Lines</Mantine.Button>
            <Mantine.Button variant="outline" color="red" onClick={clearAllLines}>Clear All</Mantine.Button>
          </Mantine.Group>

          <Mantine.Group mt="sm" position="left" align="center">
            <Mantine.Badge color={connStatus === 'open' ? 'green' : connStatus === 'connecting' ? 'yellow' : 'red'}>{connStatus}</Mantine.Badge>
            <Mantine.Text size="sm">Connection status</Mantine.Text>
          </Mantine.Group>

          <div style={{ marginTop: 8 }}>
            <Mantine.Text size="sm" weight={600}>Event Log</Mantine.Text>
            <Mantine.ScrollArea style={{ height: 160, background: '#0b1220', color: '#cbd5e1', padding: 8, borderRadius: 6 }}>
              {(!logs || logs.length === 0) ? <Mantine.Text color="dimmed">No events yet</Mantine.Text> : logs.slice().reverse().map((l,i)=>(<div key={i}>{l}</div>))}
            </Mantine.ScrollArea>
          </div>
        </div>

        <div>
          <Mantine.Text size="sm" weight={600}>Anchor display names</Mantine.Text>
          <Mantine.Text color="dimmed" size="sm">Assign friendly names to anchors (beacon ids)</Mantine.Text>
          <Mantine.Stack mt="sm">
            {anchors.map(a=> (
              <Mantine.Group key={a.beaconId} spacing="sm">
                <Mantine.Text weight={600} style={{ minWidth: 120 }}>{a.beaconId}</Mantine.Text>
                <Mantine.TextInput value={anchorNames[a.beaconId]||''} onChange={e=> setAnchorNames(prev=>({ ...prev, [a.beaconId]: e.target.value }))} sx={{ flex: 1 }} />
              </Mantine.Group>
            ))}
          </Mantine.Stack>
        </div>

        <div>
          <Mantine.Text size="sm" weight={600}>Device display names</Mantine.Text>
          <Mantine.Text color="dimmed" size="sm">Assign friendly names to tracked devices when known.</Mantine.Text>
          <Mantine.Stack mt="sm">
            {Object.keys(deviceNames||{}).map(d => (
              <Mantine.Group key={d} spacing="sm">
                <Mantine.Text weight={600} style={{ minWidth: 120 }}>{d}</Mantine.Text>
                <Mantine.TextInput value={deviceNames[d]||''} onChange={e=> setDeviceNames(prev=>({ ...prev, [d]: e.target.value }))} sx={{ flex: 1 }} />
              </Mantine.Group>
            ))}
          </Mantine.Stack>
        </div>

      </Mantine.Stack>
    </div>
  )
}
