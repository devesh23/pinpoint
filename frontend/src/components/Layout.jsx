/**
 * Layout components for the Pinpoint frontend - Matching reference design exactly
 */
import React from 'react'
import { IconDeviceAnalytics, IconListDetails, IconBuilding, IconSettings, IconMenu2, IconSun } from '@tabler/icons-react'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { label: 'Device Map', view: 'home', icon: IconDeviceAnalytics },
  { label: 'Device List', view: 'devices', icon: IconListDetails },
  { label: 'Map Management', view: 'management', icon: IconBuilding }
]

function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      className={cn(
        "flex flex-col items-center justify-center py-4 px-4 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-l-2 border-transparent",
        active && "text-blue-500 bg-accent/30 border-l-blue-500"
      )}
      onClick={onClick}
      title={label}
    >
      <Icon size={24} strokeWidth={1.5} className="mb-2" />
      <span className="text-[10px] leading-tight text-center whitespace-nowrap">{label.split(' ')[0]}</span>
      <span className="text-[10px] leading-tight text-center whitespace-nowrap">{label.split(' ')[1] || ''}</span>
    </button>
  )
}

export function TopBar({
  onOpenAdmin,
  onNavigate = () => { },
  currentView = 'home',
  onTogglePanel,
  deviceMetrics = {},
  anchors = [],
  children
}) {
  const activeView = navItems.some(item => item.view === currentView) ? currentView : 'home'

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1a1a]">
      {/* Sidebar - Narrow with proper spacing */}
      <aside className="w-[100px] bg-[#0a0a0a] border-r border-[#2a2a2a] flex flex-col">
        <div className="h-16 flex items-center justify-center border-b border-[#2a2a2a]">
          <IconDeviceAnalytics size={28} className="text-blue-500" />
        </div>

        <nav className="flex-1">
          {navItems.map(item => (
            <NavButton
              key={item.label}
              icon={item.icon}
              label={item.label}
              active={item.view === activeView}
              onClick={() => onNavigate(item.view)}
            />
          ))}
        </nav>

        <div className="border-t border-[#2a2a2a]">
          <button
            className="w-full flex items-center justify-center py-5 text-muted-foreground hover:text-foreground hover:bg-accent/50"
            onClick={onOpenAdmin}
            title="Settings"
          >
            <IconSettings size={22} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar - Card-based metrics */}
        <header className="bg-[#2a2a2a] border-b border-[#3a3a3a]">
          <div className="h-16 flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-4">
              {/* Card components for metrics */}
              <Card className="bg-[#1e1e1e] border-[#3a3a3a] px-3 py-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-600/20 flex items-center justify-center">
                  <span className="text-xs">🌐</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Gateway</span>
                  <span className="text-sm font-semibold text-foreground">
                    {deviceMetrics.gateway?.online ?? 0}/{deviceMetrics.gateway?.total ?? 0}
                  </span>
                </div>
              </Card>

              <Card className="bg-[#1e1e1e] border-[#3a3a3a] px-3 py-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-orange-600/20 flex items-center justify-center">
                  <span className="text-xs">📡</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Beacon</span>
                  <span className="text-sm font-semibold text-foreground">
                    {deviceMetrics.beacon?.online ?? 0}/{deviceMetrics.beacon?.total ?? 0}
                  </span>
                </div>
              </Card>

              <Card className="bg-[#1e1e1e] border-[#3a3a3a] px-3 py-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-red-600/20 flex items-center justify-center">
                  <span className="text-xs">📍</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Tag</span>
                  <span className="text-sm font-semibold text-foreground">
                    {deviceMetrics.tag?.online ?? 0}/{deviceMetrics.tag?.total ?? 0}
                  </span>
                </div>
              </Card>
            </div>

            <div className="flex items-center gap-4">
              <button
                style={{
                  height: '32px',
                  padding: '0 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '500',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                One Click
              </button>
              <button
                style={{
                  height: '32px',
                  padding: '0 16px',
                  backgroundColor: '#9333ea',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '500',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#7e22ce'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#9333ea'}
              >
                Deploy Config
              </button>

              <span className="text-xs font-semibold tracking-wider cursor-pointer hover:text-blue-400">DISPLAY</span>

              <div className="h-6 w-px bg-border" />

              <Button variant="ghost" size="icon" className="h-8 w-8">
                <IconSun size={16} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onTogglePanel && onTogglePanel()}>
                <IconMenu2 size={16} />
              </Button>
            </div>
          </div>

          {/* Map Toolbar Row - Properly spaced */}
          {currentView === 'home' && (
            <div className="h-14 flex items-center justify-between px-4 py-3 bg-[#1e1e1e] border-t border-[#3a3a3a]">
              <div className="flex items-center gap-4">
                <select className="h-9 rounded border border-[#3a3a3a] bg-[#2a2a2a] px-3 text-xs text-foreground">
                  <option>Default</option>
                </select>
                <select className="h-9 rounded border border-[#3a3a3a] bg-[#2a2a2a] px-3 text-xs text-foreground min-w-[200px]">
                  <option>View the current map device</option>
                </select>
                <button
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span className="text-sm">🔄</span>
                </button>
                <button
                  style={{
                    height: '32px',
                    width: '48px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '500',
                    borderRadius: '16px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                >
                  2D
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div>Anchor: <span className="text-foreground font-medium">{anchors.length}</span></div>
                <div>Tag: <span className="text-foreground font-medium">{Object.keys(deviceMetrics.tag?.online || {}).length || 0}</span></div>
                <div className="ml-4">Gateway: <span className="text-foreground font-medium">{deviceMetrics.gateway?.online || 0}</span></div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span>X-axis</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span>Y-axis</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden bg-[#2d2d30] relative">
          {children}
        </main>

        {/* Status Bar */}
        <footer className="h-6 bg-[#0a0a0a] border-t border-[#2a2a2a] px-4 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <div>
              Software Version: <span className="text-foreground">v1.3.0.43</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              CPU Usage: <span className="text-green-500 font-medium">18.95%</span>
            </div>
            <div>
              Memory Usage: <span className="text-red-500 font-medium">88.4%</span>
            </div>
            <div>
              Disk Usage: <span className="text-yellow-500 font-medium">89.29%</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
