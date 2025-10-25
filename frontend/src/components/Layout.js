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
export function TopBar({ apiKey, setApiKey, pollUrl, setPollUrl, fetchNow }){
  return (
    <header className="topbar">
      <h1>Pinpoint — Factory Live Location</h1>
      <div className="controls">
        <input className="input" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="API Key" />
        <input className="input wide" value={pollUrl} onChange={e=>setPollUrl(e.target.value)} placeholder="Poll URL" />
        <button className="btn" onClick={fetchNow}>Fetch Now</button>
      </div>
    </header>
  )
}

export default { TopBar }
