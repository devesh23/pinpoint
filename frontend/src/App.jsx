import React, { useState, useRef, useEffect } from 'react'
import axios from 'axios'

function TopBar({ apiKey, setApiKey, pollUrl, setPollUrl, fetchNow }){
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

function App(){
  const [apiKey, setApiKey] = useState('demo-key-123')
  const [pollUrl, setPollUrl] = useState('/mock_positions.json')
  const [employees, setEmployees] = useState([])
  const [image, setImage] = useState(null)
  const imgRef = useRef()

  useEffect(()=>{
    // initial load
    fetchPositions()
  }, [])

  async function fetchPositions(){
    try{
      const res = await axios.get(pollUrl, { headers: { 'x-api-key': apiKey } })
      setEmployees(res.data.positions || [])
    }catch(e){
      console.error(e)
      alert('Failed to fetch positions: '+ (e.message || e))
    }
  }

  return (
    <div className="app">
      <TopBar apiKey={apiKey} setApiKey={setApiKey} pollUrl={pollUrl} setPollUrl={setPollUrl} fetchNow={fetchPositions} />

      <main className="main">
        <section className="left">
          <div className="planCard">
            <div className="planControls">
              <input type="file" accept="image/*" onChange={e=>{
                const f = e.target.files[0]; if(!f) return; setImage(URL.createObjectURL(f))
              }} />
              <button className="btn muted" onClick={()=>setImage('/default-plan.svg')}>Use Default Plan</button>
            </div>

            <div className="planCanvas">
              {image ? <img ref={imgRef} src={image} alt="plan" /> : <div className="empty">No plan loaded</div>}

              {/* employees overlay */}
              {image && employees.map(emp=> (
                <div key={emp.id} className="dot" style={{ left:`${emp.x*100}%`, top:`${emp.y*100}%` }}>{emp.label||emp.id}</div>
              ))}
            </div>
          </div>
        </section>

        <aside className="right">
          <div className="panel">
            <h3>Latest Positions</h3>
            <pre className="json">{JSON.stringify(employees, null, 2)}</pre>
          </div>
          <div className="panel muted">
            <h4>Notes</h4>
            <p>Interactive router placement, CSV import, and triangulation can be added next.</p>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
