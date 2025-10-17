// Utility functions used by the demo
window.PinpointUtils = (function(){
  // Convert normalized coords (0..1) to pixel coords given bounding client rect
  function normalizedToPx(norm, rect){
    return {
      x: rect.left + norm.x * rect.width,
      y: rect.top + norm.y * rect.height
    };
  }

  // Convert pixel coords (relative to container top-left) to normalized 0..1
  function pxToNormalized(px, rect){
    return {
      x: Math.max(0, Math.min(1, (px.x - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (px.y - rect.top) / rect.height))
    };
  }

  // Simple mock fetch that returns the mock_positions.json if given that path
  async function fetchPositions(url, apiKey){
    const headers = { 'x-api-key': apiKey || '' };
    const resp = await fetch(url, { headers });
    if(!resp.ok) throw new Error('Failed to fetch positions: ' + resp.status);
    return resp.json();
  }

  return { normalizedToPx, pxToNormalized, fetchPositions };
})();
