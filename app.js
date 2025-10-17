const { useState, useRef, useEffect } = React;

function App(){
  const [imageSrc, setImageSrc] = useState(null);
  const [routers, setRouters] = useState([]); // {id, x:0..1, y:0..1}
  const [pollUrl, setPollUrl] = useState('mock_positions.json');
  const [apiKey, setApiKey] = useState('demo-key-123');
  const [employees, setEmployees] = useState([]);
  const [polling, setPolling] = useState(true);
  const [pollIntervalSec, setPollIntervalSec] = useState(60);
  const containerRef = useRef();
  const imgRef = useRef();
  const pollRef = useRef();

  useEffect(()=>{ // start polling
    async function doPoll(){
      try{
        const data = await PinpointUtils.fetchPositions(pollUrl, apiKey);
        // Assume response structure: { timestamp:..., positions: [{id, x, y}] }
        setEmployees(data.positions || []);
      }catch(e){
        console.error(e);
      }
    }

    if(polling){
      doPoll();
      pollRef.current = setInterval(doPoll, (pollIntervalSec||60)*1000);
    }
    return ()=> clearInterval(pollRef.current);
  }, [pollUrl, apiKey, polling]);

  function onImageUpload(e){
    const f = e.target.files[0];
    if(!f) return;
    const url = URL.createObjectURL(f);
    setImageSrc(url);
    // reset routers/employees
    setRouters([]);
    setEmployees([]);
  }

  function onUseDefault(){
    // simple generated SVG as data URL
    const svg = `data:image/svg+xml;utf8,` + encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='1000' height='600'>
        <rect width='100%' height='100%' fill='#f3f4f6' stroke='#d1d5db' />
        <text x='50' y='40' font-size='28' fill='#374151'>Factory Layout (Demo)</text>
        <rect x='60' y='80' width='420' height='200' fill='#fff' stroke='#cbd5e1'/>
        <rect x='540' y='80' width='380' height='200' fill='#fff' stroke='#cbd5e1'/>
        <rect x='60' y='320' width='860' height='220' fill='#fff' stroke='#cbd5e1'/>
      </svg>
    `);
    setImageSrc(svg);
    setRouters([]);
    setEmployees([]);
  }

  // place router by clicking on image
  function onCanvasClick(e){
    if(routers.length >= 3) return; // limit to 3 for demo
    const rect = imgRef.current.getBoundingClientRect();
    const px = { x: e.clientX, y: e.clientY };
    const norm = PinpointUtils.pxToNormalized(px, rect);
    setRouters(r=>[...r, { id: r.length+1, x: norm.x, y: norm.y }]);
  }

  function startDrag(i, e){
    e.preventDefault();
    // capture mouse move on window
    const onMove = (ev)=>{
      const rect = imgRef.current.getBoundingClientRect();
      const norm = PinpointUtils.pxToNormalized({ x: ev.clientX, y: ev.clientY }, rect);
      setRouters(r=> r.map((ro, idx)=> idx===i ? { ...ro, x: norm.x, y: norm.y } : ro));
    };
    const onUp = ()=>{
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function renderRouters(rect){
    return routers.map((r, idx)=>{
      const left = r.x * rect.width;
      const top = r.y * rect.height;
      return (
        <div key={r.id} className="router" style={{ position:'absolute', left, top, transform: 'translate(-50%,-50%)', pointerEvents:'auto' }} onMouseDown={(e)=>startDrag(idx,e)}>
          {r.id}
        </div>
      );
    });
  }

  function renderEmployees(rect){
    return employees.map(emp=>{
      const left = emp.x * rect.width;
      const top = emp.y * rect.height;
      return (
        <div key={emp.id} className="employeeDot" style={{ left, top }} title={emp.id}>{emp.label || emp.id}</div>
      );
    });
  }

  return (
    <div className="app">
      <div className="header">
        <h2>Factory Live Pinpoint — UI Demo</h2>
        <div className="controls">
          <div className="controlsRow panel">
            <label className="keyInput">API Key: <input className="keyInput" value={apiKey} onChange={e=>setApiKey(e.target.value)} /></label>
            <label>Poll URL: <input value={pollUrl} onChange={e=>setPollUrl(e.target.value)} style={{ width:300 }} /></label>
            <label>Interval (s): <input value={pollIntervalSec} onChange={e=>setPollIntervalSec(Number(e.target.value))} style={{ width:80 }} /></label>
            <button className="button" onClick={()=>setPolling(p=>!p)}>{polling? 'Pause Polling' : 'Resume Polling'}</button>
            <button className="button secondary" onClick={async ()=>{
              try{
                const data = await PinpointUtils.fetchPositions(pollUrl, apiKey);
                setEmployees(data.positions || []);
                alert('Fetch successful; positions loaded.');
              }catch(e){ alert('Fetch failed: '+e.message); }
            }}>Fetch Now</button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop:12 }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div>
            <input type="file" accept="image/*" onChange={onImageUpload} />
            <div style={{ marginTop:8 }}>
              <button className="button secondary" onClick={onUseDefault}>Use Default Demo Plan</button>
            </div>
          </div>

          <div style={{ marginLeft:20 }}>
            <small className="note">Place exactly three routers by clicking on the plan. You can drag them after placing. This demo uses normalized coordinates so resizing preserves positions.</small>
          </div>
        </div>

        <div className="canvasWrap">
          <div ref={containerRef} className="factoryCanvas panel" style={{ width:1000, height:600 }} onClick={onCanvasClick}>
            {imageSrc ? (
              <img ref={imgRef} src={imageSrc} alt="Factory plan" style={{ width:'100%', height:'100%' }} />
            ) : (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#666' }}>No plan loaded</div>
            )}

            {/* overlay for routers and employees placed using absolute coords inside container */}
            <div className="overlay" style={{ position:'absolute', left:0, top:0, width:'100%', height:'100%' }}>
              {imageSrc && (()=>{
                const rect = { left:0, top:0, width:1000, height:600 };
                return (
                  <React.Fragment>
                    {renderRouters(rect)}
                    {renderEmployees(rect)}
                  </React.Fragment>
                );
              })()}
            </div>
          </div>

          <div style={{ width:320 }}>
            <div className="panel">
              <h4>Routers (placed)</h4>
              <ol>
                {routers.map(r=> <li key={r.id}>Router {r.id}: x={r.x.toFixed(3)}, y={r.y.toFixed(3)}</li>)}
              </ol>
              <h4>Latest Positions</h4>
              <div className="jsonPreview">{JSON.stringify(employees, null, 2)}</div>
            </div>

            <div style={{ marginTop:12 }} className="panel">
              <h4>Notes</h4>
              <p>Alternative to manual router coordinates: place routers interactively on the plan (done here). In production you can import router positions from a CSV or discover them automatically if routers provide their absolute positions.</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop:12 }} className="panel">
        <h4>How it works (contract)</h4>
        <ul>
          <li>Inputs: a 2D plan image, 3 router positions (normalized) and a poll URL + API key</li>
          <li>Outputs: red dots positioned on the plan for each employee (normalized coordinates from API)</li>
          <li>Error modes: fetch failures are logged to console; polling can be paused</li>
        </ul>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
