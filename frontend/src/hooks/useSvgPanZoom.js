import { useEffect, useMemo, useState } from 'react'

/**
 * useSvgPanZoom
 * Manages SVG viewBox pan/zoom and client<->normalized coordinate mapping.
 *
 * Params:
 * - planRef: ref to plan container (the absolute-positioned area containing the image/svg)
 * - imgRef: ref to the rendered element (either <img>, <div> containing inline <svg>, or <svg>)
 * - image: current plan image; either string (raster URL) or { type:'svg', width, height, content }
 * - options: { disabled?: boolean }
 *
 * Returns:
 * { svgViewBox, setSvgViewBox, zoom, pan, reset, clientToNormalized, normToPercent }
 */
export function useSvgPanZoom({ planRef, imgRef, image, disabled=false }){
  const [svgViewBox, setSvgViewBox] = useState(null)

  // Helpers that rely on current DOM metrics
  const clientToNormalized = useMemo(()=>{
    return function clientToNormalized(clientX, clientY){
      if(!planRef.current) return { nx: clientX, ny: clientY }
      const planRect = planRef.current.getBoundingClientRect()
      const wrapper = imgRef.current
      if(!wrapper) return { nx: (clientX - planRect.left) / planRect.width, ny: (clientY - planRect.top) / planRect.height }
      let svgEl = null
      if(wrapper.tagName && wrapper.tagName.toLowerCase() === 'div') svgEl = wrapper.querySelector('svg')
      const targetRect = svgEl ? svgEl.getBoundingClientRect() : wrapper.getBoundingClientRect()
      const clientXIn = clientX - targetRect.left
      const clientYIn = clientY - targetRect.top

      if(svgEl){
        const elW = targetRect.width, elH = targetRect.height
        const imgW = (image && typeof image === 'object' && image.type === 'svg' && image.width) ? image.width : ((svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) ? svgEl.viewBox.baseVal.width : (svgEl.getAttribute('width') ? Number(svgEl.getAttribute('width')) : elW))
        const imgH = (image && typeof image === 'object' && image.type === 'svg' && image.height) ? image.height : ((svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height) ? svgEl.viewBox.baseVal.height : (svgEl.getAttribute('height') ? Number(svgEl.getAttribute('height')) : elH))
        const vbX = svgViewBox ? svgViewBox.x : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.x) || 0
        const vbY = svgViewBox ? svgViewBox.y : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.y) || 0
        const vbW = svgViewBox ? svgViewBox.w : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) || imgW
        const vbH = svgViewBox ? svgViewBox.h : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height) || imgH
        const px = vbX + (clientXIn / elW) * vbW
        const py = vbY + (clientYIn / elH) * vbH
        const nx = px / imgW
        const ny = py / imgH
        return { nx: Math.max(0,Math.min(1,nx)), ny: Math.max(0,Math.min(1,ny)) }
      }

      // Raster image path (object-fit: contain)
      const elW = targetRect.width, elH = targetRect.height
      let nw = wrapper.naturalWidth, nh = wrapper.naturalHeight
      if(!nw || !nh){ nw = elW; nh = elH }
      const scale = Math.min(elW / nw, elH / nh)
      const renderW = nw * scale
      const renderH = nh * scale
      const offsetX = (elW - renderW) / 2
      const offsetY = (elH - renderH) / 2
      const xInEl = clientX - targetRect.left
      const yInEl = clientY - targetRect.top
      const nx = (xInEl - offsetX) / renderW
      const ny = (yInEl - offsetY) / renderH
      return { nx: Math.max(0,Math.min(1,nx)), ny: Math.max(0,Math.min(1,ny)) }
    }
  }, [planRef, imgRef, image, svgViewBox])

  const normToPercent = useMemo(()=>{
    return function normToPercent(nx, ny){
      if(!planRef.current) return { left: nx*100, top: ny*100 }
      const wrapper = imgRef.current
      if(!wrapper) return { left: nx*100, top: ny*100 }
      let svgEl = null
      if(wrapper.tagName && wrapper.tagName.toLowerCase() === 'div') svgEl = wrapper.querySelector('svg')
      const targetRect = svgEl ? svgEl.getBoundingClientRect() : wrapper.getBoundingClientRect()
      const elW = targetRect.width, elH = targetRect.height

      if(svgEl){
        const imgW = (image && typeof image === 'object' && image.type === 'svg' && image.width) ? image.width : ((svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) ? svgEl.viewBox.baseVal.width : elW)
        const imgH = (image && typeof image === 'object' && image.type === 'svg' && image.height) ? image.height : ((svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height) ? svgEl.viewBox.baseVal.height : elH)
        const px = nx * imgW
        const py = ny * imgH
        const vbX = svgViewBox ? svgViewBox.x : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.x) || 0
        const vbY = svgViewBox ? svgViewBox.y : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.y) || 0
        const vbW = svgViewBox ? svgViewBox.w : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) || imgW
        const vbH = svgViewBox ? svgViewBox.h : (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.height) || imgH
        const pxInView = (px - vbX) / vbW * elW
        const pyInView = (py - vbY) / vbH * elH
        const absLeft = targetRect.left + pxInView
        const absTop = targetRect.top + pyInView
      const planRect = planRef.current.getBoundingClientRect()
        let leftPct = ((absLeft - planRect.left) / planRect.width) * 100
        let topPct = ((absTop - planRect.top) / planRect.height) * 100
        leftPct = Math.max(0, Math.min(100, leftPct))
        topPct = Math.max(0, Math.min(100, topPct))
        return { left: leftPct, top: topPct }
      }

      // Raster path
      const planRect = planRef.current.getBoundingClientRect()
      let nw = wrapper.naturalWidth, nh = wrapper.naturalHeight
      const elW2 = targetRect.width, elH2 = targetRect.height
      if(!nw || !nh){ nw = elW2; nh = elH2 }
      const scale = Math.min(elW2 / nw, elH2 / nh)
      const renderW = nw * scale
      const renderH = nh * scale
      const offsetX = (elW2 - renderW) / 2
      const offsetY = (elH2 - renderH) / 2
      const pixelXInEl = offsetX + nx * renderW
      const pixelYInEl = offsetY + ny * renderH
      const absLeft = targetRect.left + pixelXInEl
      const absTop = targetRect.top + pixelYInEl
      let leftPct = ((absLeft - planRect.left) / planRect.width) * 100
      let topPct = ((absTop - planRect.top) / planRect.height) * 100
      leftPct = Math.max(0, Math.min(100, leftPct))
      topPct = Math.max(0, Math.min(100, topPct))
      return { left: leftPct, top: topPct }
    }
  }, [planRef, imgRef, image, svgViewBox])

  // Programmatic controls
  function zoom(factor, centerNorm={ x: 0.5, y: 0.5 }){
    if(!(image && image.type === 'svg') || !svgViewBox) return
    const { x, y, w, h } = svgViewBox
    const newW = w / factor
    const newH = h / factor
    const cx = x + centerNorm.x * w
    const cy = y + centerNorm.y * h
    const nx = cx - centerNorm.x * newW
    const ny = cy - centerNorm.y * newH
    setSvgViewBox({ x: nx, y: ny, w: newW, h: newH })
  }

  function pan(dx, dy){
    if(!(image && image.type === 'svg') || !svgViewBox) return
    setSvgViewBox(prev => ({ x: prev.x + dx, y: prev.y + dy, w: prev.w, h: prev.h }))
  }

  function reset(){
    if(!(image && image.type === 'svg')) return
    setSvgViewBox({ x: 0, y: 0, w: image.width, h: image.height })
  }

  // Apply viewBox to inline svg when updated
  useEffect(()=>{
    if(!image || image.type !== 'svg') return
    const wrapper = imgRef.current
    if(!wrapper) return
    const svgEl = wrapper.querySelector('svg')
    if(!svgEl || !svgViewBox) return
    svgEl.setAttribute('viewBox', `${svgViewBox.x} ${svgViewBox.y} ${svgViewBox.w} ${svgViewBox.h}`)
  }, [svgViewBox, image, imgRef])

  // Mouse drag-to-pan
  useEffect(()=>{
    const el = planRef.current
    if(!el) return
    if(!(image && image.type === 'svg')) return
    let dragging = false
    let startX=0, startY=0
    let startVb = null
    const onDown = (e)=>{
      if(disabled) return
      dragging = true
      startX = e.clientX; startY = e.clientY
      startVb = svgViewBox ? { ...svgViewBox } : null
      document.body.style.cursor = 'grabbing'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    const onMove = (e)=>{
      if(!dragging || !startVb) return
      const rect = el.getBoundingClientRect()
      const dxPx = e.clientX - startX
      const dyPx = e.clientY - startY
      const dx = (dxPx / rect.width) * startVb.w
      const dy = (dyPx / rect.height) * startVb.h
      setSvgViewBox({ x: startVb.x - dx, y: startVb.y - dy, w: startVb.w, h: startVb.h })
    }
    const onUp = ()=>{
      dragging = false
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    el.addEventListener('mousedown', onDown)
    return ()=>{ el.removeEventListener('mousedown', onDown); onUp() }
  }, [planRef, image, svgViewBox, disabled])

  // Mouse wheel zoom
  useEffect(()=>{
    const el = planRef.current
    if(!el) return
    if(!(image && image.type==='svg')) return
    const onWheel = (e)=>{
      if(!svgViewBox) return
      if(disabled) return
      e.preventDefault()
      const base = 1.08
      const factor = Math.pow(base, -(e.deltaY || 0) / (e.ctrlKey || e.metaKey ? 60 : 100))
      const { nx, ny } = clientToNormalized(e.clientX, e.clientY)
      zoom(factor, { x: nx, y: ny })
    }
    el.addEventListener('wheel', onWheel, { passive:false })
    return ()=> el.removeEventListener('wheel', onWheel)
  }, [planRef, image, svgViewBox, disabled, clientToNormalized])

  // Touch pinch-zoom and one-finger pan
  useEffect(()=>{
    const el = planRef.current
    if(!el) return
    if(!(image && image.type==='svg')) return
    let pinch = { active:false, startDist:0, startVb:null, center:{x:0.5,y:0.5} }
    let panState = { active:false, startX:0, startY:0, startVb:null }

    const getPoint = (t)=> ({ x: t.clientX, y: t.clientY })
    const distance = (a,b)=> Math.hypot(a.x-b.x, a.y-b.y)

    const onTouchStart = (e)=>{
      if(disabled) return
      if(e.touches.length===2){
        e.preventDefault()
        const p1 = getPoint(e.touches[0]); const p2 = getPoint(e.touches[1])
        pinch.active = true
        pinch.startDist = distance(p1,p2)
        pinch.startVb = svgViewBox ? { ...svgViewBox } : null
        const cx = (p1.x + p2.x)/2, cy = (p1.y + p2.y)/2
        const { nx, ny } = clientToNormalized(cx, cy)
        pinch.center = { x: nx, y: ny }
        panState.active = false
      } else if(e.touches.length===1){
        e.preventDefault()
        panState.active = true
        panState.startX = e.touches[0].clientX
        panState.startY = e.touches[0].clientY
        panState.startVb = svgViewBox ? { ...svgViewBox } : null
        pinch.active = false
      }
    }
    const onTouchMove = (e)=>{
      if(pinch.active && e.touches.length===2 && pinch.startVb){
        e.preventDefault()
        const p1 = getPoint(e.touches[0]); const p2 = getPoint(e.touches[1])
        const cur = distance(p1,p2)
        if(cur <= 0) return
        const scale = cur / pinch.startDist
        const newW = pinch.startVb.w / scale
        const newH = pinch.startVb.h / scale
        const cpx = pinch.startVb.x + pinch.center.x * pinch.startVb.w
        const cpy = pinch.startVb.y + pinch.center.y * pinch.startVb.h
        const nx = cpx - pinch.center.x * newW
        const ny = cpy - pinch.center.y * newH
        setSvgViewBox({ x: nx, y: ny, w: newW, h: newH })
      } else if(panState.active && e.touches.length===1 && panState.startVb){
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const dxPx = e.touches[0].clientX - panState.startX
        const dyPx = e.touches[0].clientY - panState.startY
        const dx = (dxPx / rect.width) * panState.startVb.w
        const dy = (dyPx / rect.height) * panState.startVb.h
        setSvgViewBox({ x: panState.startVb.x - dx, y: panState.startVb.y - dy, w: panState.startVb.w, h: panState.startVb.h })
      }
    }
    const onTouchEnd = ()=>{ pinch.active=false; panState.active=false }

    el.addEventListener('touchstart', onTouchStart, { passive:false })
    el.addEventListener('touchmove', onTouchMove, { passive:false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return ()=>{
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [planRef, image, svgViewBox, disabled, clientToNormalized])

  return { svgViewBox, setSvgViewBox, zoom, pan, reset, clientToNormalized, normToPercent }
}
