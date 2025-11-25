import React from 'react'
import * as Mantine from '@mantine/core'

export default function RightPanel({ open = true, onClose = () => { }, anchors = [], employees = [], logs = [], debugInfo = null, frameCount = 0, showDebug = false, setShowDebug = () => { }, onMockAnchors = () => { }, anchorMode = false, setAnchorMode = () => { }, showMiniMap = false, setShowMiniMap = () => { } }) {
  return (
    <Mantine.Drawer
      opened={open}
      onClose={onClose}
      position="right"
      size={380}
      withOverlay={false}
      closeOnClickOutside={false}
      trapFocus={false}
      title={<Mantine.Group position="apart" style={{ width: '100%' }}><Mantine.Text weight={600}>Panel</Mantine.Text><Mantine.Badge size="sm" color="teal" variant="light">frames {frameCount}</Mantine.Badge></Mantine.Group>}
    >
      <Mantine.Tabs defaultValue="devices" keepMounted={false}>
        <Mantine.Tabs.List grow>
          <Mantine.Tabs.Tab value="devices">Devices</Mantine.Tabs.Tab>
          <Mantine.Tabs.Tab value="anchors">Anchors</Mantine.Tabs.Tab>
          <Mantine.Tabs.Tab value="stream">Stream</Mantine.Tabs.Tab>
          <Mantine.Tabs.Tab value="debug">Debug</Mantine.Tabs.Tab>
          <Mantine.Tabs.Tab value="controls">Controls</Mantine.Tabs.Tab>
        </Mantine.Tabs.List>

        <Mantine.Tabs.Panel value="devices" pt="xs" style={{ display: 'flex' }}>
          <Mantine.ScrollArea style={{ flex: 1 }}>
            <Mantine.Table highlightOnHover verticalSpacing="xs" fontSize="sm">
              <thead><tr><th>Name</th><th>ID</th><th>X</th><th>Y</th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}><td>{e.label || e.id}</td><td><Mantine.Code>{e.id}</Mantine.Code></td><td>{e.x?.toFixed?.(2)}</td><td>{e.y?.toFixed?.(2)}</td></tr>
                ))}
              </tbody>
            </Mantine.Table>
          </Mantine.ScrollArea>
        </Mantine.Tabs.Panel>

        <Mantine.Tabs.Panel value="anchors" pt="xs" style={{ display: 'flex' }}>
          <Mantine.ScrollArea style={{ flex: 1 }}>
            <Mantine.Group position="apart" mb="xs">
              <Mantine.Text weight={600}>Anchors</Mantine.Text>
              <Mantine.Switch size="sm" checked={anchorMode} onChange={(e) => setAnchorMode(e.currentTarget.checked)} label={anchorMode ? 'Placing…' : 'Place anchors'} />
            </Mantine.Group>
            <Mantine.Table highlightOnHover verticalSpacing="xs" fontSize="sm">
              <thead><tr><th>Name</th><th>ID</th><th>x</th><th>y</th></tr></thead>
              <tbody>
                {anchors.map(a => (
                  <tr key={a.beaconId}><td>{a.name || a.beaconId}</td><td><Mantine.Code>{a.beaconId}</Mantine.Code></td><td>{a.x.toFixed(3)}</td><td>{a.y.toFixed(3)}</td></tr>
                ))}
              </tbody>
            </Mantine.Table>
            <Mantine.Text size="xs" color="dimmed" mt="xs">Tip: When “Place anchors” is on, click on the plan to add anchors, or drag existing ones.</Mantine.Text>
          </Mantine.ScrollArea>
        </Mantine.Tabs.Panel>

        <Mantine.Tabs.Panel value="stream" pt="xs">
          <Mantine.ScrollArea style={{ height: '100%' }}>
            <Mantine.Text size="sm" color="dimmed">Latest frame</Mantine.Text>
            <pre className="json" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(debugInfo, null, 2)}</pre>
          </Mantine.ScrollArea>
        </Mantine.Tabs.Panel>

        <Mantine.Tabs.Panel value="debug" pt="xs">
          <Mantine.ScrollArea style={{ height: '100%' }}>
            <Mantine.Text size="sm" color="dimmed">Logs</Mantine.Text>
            <pre className="json" style={{ whiteSpace: 'pre-wrap' }}>{(logs || []).join('\n')}</pre>
          </Mantine.ScrollArea>
        </Mantine.Tabs.Panel>

        <Mantine.Tabs.Panel value="controls" pt="xs">
          <Mantine.Group direction="column" spacing="xs">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={showDebug} onChange={e => setShowDebug(e.target.checked)} />
              <Mantine.Text size="sm">Show floating debug overlay</Mantine.Text>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={showMiniMap} onChange={e => setShowMiniMap(e.target.checked)} />
              <Mantine.Text size="sm">Show mini map</Mantine.Text>
            </label>
            <Mantine.Divider my={6} />
            <Mantine.Button size="xs" variant="light" onClick={onMockAnchors}>Mock Anchors</Mantine.Button>
          </Mantine.Group>
        </Mantine.Tabs.Panel>
      </Mantine.Tabs>
    </Mantine.Drawer>
  )
}
