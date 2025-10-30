import React, { useState, useEffect } from 'react'
import { Modal, Group, TextInput, NumberInput, Switch, Select, Button, Text, ScrollArea, Badge, Stack } from '@mantine/core'

export default function Admin({ anchors, setAnchors, anchorNames, setAnchorNames, deviceNames, setDeviceNames, factoryWidthMeters, factoryHeightMeters, setFactoryWidthMeters, setFactoryHeightMeters, onClose, apiKey, setApiKey, pollUrl, setPollUrl, useLive, setUseLive, smoothingMethod, setSmoothingMethod, connStatus, logs, fetchNow, clearLines, clearAllLines }){
  const [localAnchors, setLocalAnchors] = useState(anchors)
  useEffect(()=> setLocalAnchors(anchors), [anchors])

  function save(){
    setAnchors(localAnchors)
    onClose()
  }

  return (
    <div style={{ padding: 12 }}>
      <Stack spacing="md">
        <Group position="apart">
          <Text weight={700} size="lg">Admin</Text>
          <Group>
            <Button variant="default" onClick={onClose}>Close</Button>
            <Button onClick={save}>Save</Button>
          </Group>
        </Group>

        <Group grow>
          <NumberInput label="Factory Width (m)" value={factoryWidthMeters} onChange={(v)=> setFactoryWidthMeters(v||0)} />
          <NumberInput label="Factory Height (m)" value={factoryHeightMeters} onChange={(v)=> setFactoryHeightMeters(v||0)} />
        </Group>

        <div>
          <Text size="sm" weight={600}>Connection & Stream</Text>
          <Text color="dimmed" size="sm">Configure API key, poll URL, streaming mode and smoothing.</Text>
          <Group mt="sm">
            <TextInput placeholder="API Key (optional)" value={apiKey||''} onChange={e=>setApiKey(e.target.value)} />
            <TextInput placeholder="Poll URL" value={pollUrl||''} onChange={e=>setPollUrl(e.target.value)} sx={{ flex: 1 }} />
          </Group>
          <Group mt="sm">
            <Switch label="Use Live Stream" checked={!!useLive} onChange={(e)=>setUseLive(e.currentTarget.checked)} />
            <Select data={[{ value: 'ema', label: 'EMA (fast)' }, { value: 'kalman', label: 'Kalman (smooth)' }]} value={smoothingMethod||'ema'} onChange={(v)=>setSmoothingMethod(v)} style={{ width: 220 }} />
            <Button onClick={fetchNow}>Fetch Now</Button>
            <Button variant="light" onClick={clearLines}>Clear Lines</Button>
            <Button variant="outline" color="red" onClick={clearAllLines}>Clear All</Button>
          </Group>

          <Group mt="sm" position="left" align="center">
            <Badge color={connStatus === 'open' ? 'green' : connStatus === 'connecting' ? 'yellow' : 'red'}>{connStatus}</Badge>
            <Text size="sm">Connection status</Text>
          </Group>

          <div style={{ marginTop: 8 }}>
            <Text size="sm" weight={600}>Event Log</Text>
            <ScrollArea style={{ height: 160, background: '#0b1220', color: '#cbd5e1', padding: 8, borderRadius: 6 }}>
              {(!logs || logs.length === 0) ? <Text color="dimmed">No events yet</Text> : logs.slice().reverse().map((l,i)=>(<div key={i}>{l}</div>))}
            </ScrollArea>
          </div>
        </div>

        <div>
          <Text size="sm" weight={600}>Anchor display names</Text>
          <Text color="dimmed" size="sm">Assign friendly names to anchors (beacon ids)</Text>
          <Stack mt="sm">
            {anchors.map(a=> (
              <Group key={a.beaconId} spacing="sm">
                <Text weight={600} style={{ minWidth: 120 }}>{a.beaconId}</Text>
                <TextInput value={anchorNames[a.beaconId]||''} onChange={e=> setAnchorNames(prev=>({ ...prev, [a.beaconId]: e.target.value }))} sx={{ flex: 1 }} />
              </Group>
            ))}
          </Stack>
        </div>

        <div>
          <Text size="sm" weight={600}>Device display names</Text>
          <Text color="dimmed" size="sm">Assign friendly names to tracked devices when known.</Text>
          <Stack mt="sm">
            {Object.keys(deviceNames||{}).map(d => (
              <Group key={d} spacing="sm">
                <Text weight={600} style={{ minWidth: 120 }}>{d}</Text>
                <TextInput value={deviceNames[d]||''} onChange={e=> setDeviceNames(prev=>({ ...prev, [d]: e.target.value }))} sx={{ flex: 1 }} />
              </Group>
            ))}
          </Stack>
        </div>

      </Stack>
    </div>
  )
}
