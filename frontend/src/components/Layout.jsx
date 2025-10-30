/**
 * Layout components for the Pinpoint frontend.
 *
 * This file contains presentational components (TopBar, small helpers) so that
 * the main application logic in `App.jsx` remains focused on state and behavior.
 */
import React from 'react'

/** TopBar
 * Props:
 * - apiKey, setApiKey: controlled API key input
 * - pollUrl, setPollUrl: controlled poll URL input
 * - fetchNow: callback to trigger an immediate fetch
 */
export function TopBar({ onOpenAdmin }){
  return (
    <header className="topbar">
      <h1>Pinpoint — Factory Live Location</h1>
      <div className="controls">
        <button className="btn muted" onClick={onOpenAdmin} style={{ marginLeft: 8 }}>Admin</button>
      </div>
    </header>
  )
}

export default { TopBar }
