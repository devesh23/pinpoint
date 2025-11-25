/**
 * Layout components for the Pinpoint frontend.
 */
import React from 'react'
import * as Mantine from '@mantine/core'
import { IconDeviceAnalytics, IconListDetails, IconBuilding, IconSettings, IconMenu2, IconSun } from '@tabler/icons-react'

const navItems = [
  { label: 'Device Map', view: 'home', icon: IconDeviceAnalytics },
  { label: 'Device List', view: 'devices', icon: IconListDetails },
  { label: 'Map Management', view: 'management', icon: IconBuilding }
]

function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button className={`dashboard-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={24} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  )
}

export function TopBar({
  onOpenAdmin,
  onNavigate = () => { },
  currentView = 'home',
  backendPort,
  pollUrl,
  useLive,
  setUseLive,
  connStatus,
  onTogglePanel,
  fps,
  lastPacketAt,
  panelOpen = false,
  children,
  deviceMetrics = {},
  debugInfo = {},
  // Map-specific props
  anchors = [],
  factoryWidthMeters = 10,
  factoryHeightMeters = 10
}) {
  const activeView = navItems.some(item => item.view === currentView) ? currentView : 'home'
  const pageTitle = currentView === 'home' ? '1. Device Map' :
    currentView === 'devices' ? '2. Device List' :
      '3. Map Management'

  return (
    <div className="dashboard-shell">
      {/* Sidebar */}
      <aside className="dashboard-left-nav">
        <div className="nav-items">
          {navItems.map(item => (
            <NavButton
              key={item.label}
              icon={item.icon}
              label={item.label}
              active={item.view === activeView}
              onClick={() => onNavigate(item.view)}
            />
          ))}
        </div>
        <div className="nav-footer">
          <NavButton icon={IconSettings} label="Settings" onClick={onOpenAdmin} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dashboard-main">
        {/* Top Bar */}
        <header className="dashboard-topbar">
          <div className="topbar-main">
            <div className="topbar-left">
              <div className="metrics-inline">
                <div className="metric-inline">
                  <div className="metric-icon" style={{ background: '#1e40af' }}>
                    <span>🌐</span>
                  </div>
                  <span className="metric-text">Gateway</span>
                  <span className="metric-value">
                    {deviceMetrics.gateway?.online ?? 0}/{deviceMetrics.gateway?.total ?? 0}
                  </span>
                </div>

                <div className="metric-inline">
                  <div className="metric-icon" style={{ background: '#b45309' }}>
                    <span>📡</span>
                  </div>
                  <span className="metric-text">Beacon</span>
                  <span className="metric-value">
                    {deviceMetrics.beacon?.online ?? 0}/{deviceMetrics.beacon?.total ?? 0}
                  </span>
                </div>

                <div className="metric-inline">
                  <div className="metric-icon" style={{ background: '#be123c' }}>
                    <span>📍</span>
                  </div>
                  <span className="metric-text">Tag</span>
                  <span className="metric-value">
                    {deviceMetrics.tag?.online ?? 0}/{deviceMetrics.tag?.total ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="topbar-right">
              <button className="action-btn">
                <span>One Click</span>
              </button>
              <button className="action-btn secondary">
                <span>Deploy Config</span>
              </button>

              <span className="display-link">DISPLAY</span>

              <button className="icon-btn">
                <IconSun size={18} />
              </button>
              <button className="icon-btn" onClick={() => onTogglePanel && onTogglePanel()}>
                <IconMenu2 size={18} />
              </button>
            </div>
          </div>

          {/* Map Toolbar Row (only show on map view) */}
          {currentView === 'home' && (
            <div className="map-toolbar-row">
              <div className="map-toolbar-left">
                <select className="map-dropdown">
                  <option>Default</option>
                </select>
                <select className="map-dropdown" style={{ minWidth: 200 }}>
                  <option>View the current map device</option>
                </select>
                <button className="map-btn-circle">
                  <span>🔄</span>
                </button>
                <button className="map-btn-circle active">
                  <span>2D</span>
                </button>
              </div>

              <div className="map-toolbar-right">
                <div className="map-stat-item">
                  Anchor: <strong>{anchors.length}</strong>
                </div>
                <div className="map-stat-item">
                  Tag: <strong>{Object.keys(deviceMetrics.tag?.online || {}).length || 0}</strong>
                </div>
                <div className="map-stat-item">
                  Gateway: <strong>{deviceMetrics.gateway?.online || 0}</strong>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#ef4444' }}></span>
                  <span>X-axis</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: '#3b82f6' }}></span>
                  <span>Y-axis</span>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <div className="dashboard-content">
          {children}
        </div>

        {/* Status Bar */}
        <footer className="status-bar">
          <div className="status-left">
            <div className="status-item">
              <span>Software Version:</span>
              <span className="status-value">v1.3.0.43</span>
            </div>
          </div>
          <div className="status-right">
            <div className="status-item">
              <span>CPU Usage:</span>
              <span className={`status-value ${(debugInfo?.cpu || 18.95) > 80 ? 'red' : 'green'}`}>
                {debugInfo?.cpu ? `${debugInfo.cpu}%` : '18.95%'}
              </span>
            </div>
            <div className="status-item">
              <span>Memory Usage:</span>
              <span className={`status-value ${(debugInfo?.memory || 88.4) > 80 ? 'red' : 'green'}`}>
                {debugInfo?.memory ? `${debugInfo.memory}%` : '88.4%'}
              </span>
            </div>
            <div className="status-item">
              <span>Disk Usage:</span>
              <span className={`status-value ${(debugInfo?.disk || 89.29) > 80 ? 'red' : 'yellow'}`}>
                {debugInfo?.disk ? `${debugInfo.disk}%` : '89.29%'}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
