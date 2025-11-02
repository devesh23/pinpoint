/**
 * Layout components for the Pinpoint frontend.
 *
 * This file contains presentational components (TopBar, small helpers) so that
 * the main application logic in `App.jsx` remains focused on state and behavior.
 */
import React from 'react'
import * as Mantine from '@mantine/core'
import { IconHome, IconMapPin, IconUsers, IconRocket, IconSettings } from '@tabler/icons-react'

function NavItem({ icon: Icon, label, active, onClick }){
  return (
    <Mantine.Tooltip label={label} position="right" withArrow>
      <Mantine.UnstyledButton className={`leftnav-item ${active? 'active':''}`} onClick={onClick} aria-label={label}>
        <Icon size={18} />
        <span className="leftnav-label">{label}</span>
      </Mantine.UnstyledButton>
    </Mantine.Tooltip>
  )
}

/** TopBar + LeftNav
 * Props:
 * - onOpenAdmin: open admin/settings
 * - onNavigate: function(name) to navigate views
 * - currentView: current view string
 */
export function TopBar({ onOpenAdmin, onNavigate = ()=>{}, currentView = 'home', backendPort, pollUrl, useLive, setUseLive, connStatus, onTogglePanel, fps, lastPacketAt, panelOpen=false, children }){
  return (
    <div className="layout-shell">
      <aside className="leftnav">
        <div className="leftnav-brand" aria-label="Pinpoint">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C7.582 2 4 5.582 4 10c0 5.25 6.5 12 8 12s8-6.75 8-12c0-4.418-3.582-8-8-8z" fill="#fff"/>
            <circle cx="12" cy="10" r="3.2" fill="#8b6b3b"/>
          </svg>
        </div>
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

  <Mantine.Box component="header" className="topbar" sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }} style={{ right: panelOpen ? 380 : 0 }}>
        {/* Use a full-width box instead of Container to avoid inline margins and extra whitespace */}
        <Mantine.Box sx={{ width:'100%', height:'100%' }}>
          <Mantine.Group position="apart" align="center" noWrap style={{ height: '100%' }}>
            <Mantine.Group spacing={8} align="center" style={{ paddingLeft: 16 }} noWrap>
              <Mantine.Title order={4} style={{ margin: 0 }}>Pinpoint</Mantine.Title>
              <div className="topbar-subtitle" style={{ opacity:.7 }}>Indoor positioning & live tracking</div>
            </Mantine.Group>

            <Mantine.Group spacing="sm" align="center" noWrap>
              <Mantine.Group spacing={6} sx={{ fontSize:12, color:'#6b5e4a' }}>
                <Mantine.Badge variant="light" color={connStatus==='open'?'teal':connStatus==='connecting'?'yellow':'red'}>{connStatus}</Mantine.Badge>
                <span>fps {typeof fps==='number' ? fps.toFixed(1) : '—'}</span>
                <span>port {backendPort || '—'}</span>
                <span>last {lastPacketAt ? new Date(lastPacketAt).toLocaleTimeString() : '—'}</span>
              </Mantine.Group>
              <Mantine.Switch checked={!!useLive} onChange={(e)=> setUseLive && setUseLive(e.currentTarget.checked)} size="sm" label={useLive? 'Live' : 'Mock'} />
              <div>
                <Mantine.Button size="xs" onClick={()=> onTogglePanel && onTogglePanel() }>Panel</Mantine.Button>
              </div>
            </Mantine.Group>
          </Mantine.Group>
        </Mantine.Box>
      </Mantine.Box>

      {/* content passed from App will be rendered here so we can shift it when nav expands */}
      <div className="content" style={{ marginRight: panelOpen ? 380 : 0 }}>
        {children}
      </div>
    </div>
  )
}

// No default export to avoid accidental circular imports; use named export { TopBar }
