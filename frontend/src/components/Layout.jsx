/**
 * Layout components for the Pinpoint frontend.
 *
 * This file contains presentational components (TopBar, small helpers) so that
 * the main application logic in `App.jsx` remains focused on state and behavior.
 */
import React from 'react'
import { Box, Group, Title, Button, Container, UnstyledButton, Tooltip, Switch } from '@mantine/core'
import { IconHome, IconMapPin, IconUsers, IconRocket, IconSettings } from '@tabler/icons-react'

function NavItem({ icon: Icon, label, active, onClick }){
  return (
    <Tooltip label={label} position="right" withArrow>
      <UnstyledButton className={`leftnav-item ${active? 'active':''}`} onClick={onClick} aria-label={label}>
        <Icon size={18} />
        <span className="leftnav-label">{label}</span>
      </UnstyledButton>
    </Tooltip>
  )
}

/** TopBar + LeftNav
 * Props:
 * - onOpenAdmin: open admin/settings
 * - onNavigate: function(name) to navigate views
 * - currentView: current view string
 */
export function TopBar({ onOpenAdmin, onNavigate = ()=>{}, currentView = 'home', backendPort, pollUrl, useLive, setUseLive, connStatus, onTestPoll, children }){
  return (
    <div className="layout-shell">
      <aside className="leftnav">
        <div className="leftnav-brand">P</div>
        <div style={{ marginTop: 8 }}>
          <NavItem icon={IconHome} label="Home" active={currentView==='home'} onClick={()=>onNavigate('home')} />
          <NavItem icon={IconMapPin} label="Plan" active={currentView==='home'} onClick={()=>onNavigate('home')} />
          <NavItem icon={IconUsers} label="Devices" active={currentView==='devices'} onClick={()=>onNavigate('devices')} />
          <NavItem icon={IconRocket} label="Deploy" active={currentView==='deploy'} onClick={()=>onNavigate('deploy')} />
        </div>
        <div style={{ marginTop: 'auto', marginBottom: 12 }}>
          <NavItem icon={IconSettings} label="Settings" active={currentView==='admin'} onClick={()=>onNavigate('admin')} />
        </div>
  </aside>

  <Box component="header" className="topbar" sx={{ height: 60, display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <Container style={{ height: '100%' }}>
          <Group position="apart" align="center" style={{ height: '100%' }}>
            <Group spacing="md" align="center">
              <Title order={4} style={{ margin: 0 }}>Pinpoint</Title>
              <div className="topbar-subtitle">Indoor positioning & live tracking</div>
            </Group>

            <Group spacing="sm" align="center">
              <div style={{ fontSize:12, color:'#6b5e4a' }}>
                <span style={{ marginRight:8 }}>backend: {backendPort || '—'}</span>
                <span style={{ marginRight:8 }}>conn: {connStatus}</span>
              </div>
              <Switch checked={!!useLive} onChange={(e)=> setUseLive && setUseLive(e.currentTarget.checked)} size="sm" label={useLive? 'Live' : 'Mock'} />
              <div>
                <Button size="xs" variant="outline" onClick={()=> onTestPoll && onTestPoll() }>Test stream</Button>
              </div>
            </Group>
          </Group>
        </Container>
      </Box>

      {/* content passed from App will be rendered here so we can shift it when nav expands */}
      <div className="content">
        {children}
      </div>
    </div>
  )
}

export default { TopBar }
