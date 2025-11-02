import '@testing-library/jest-dom'

// Polyfill ResizeObserver for components that might use measurements
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!global.ResizeObserver) {
  global.ResizeObserver = ResizeObserver
}

// Basic mock for getBoundingClientRect used by positioning code
if (!Element.prototype.getBoundingClientRect) {
  Element.prototype.getBoundingClientRect = function(){
    return { x:0, y:0, top:0, left:0, bottom:0, right:0, width: 800, height: 600 }
  }
}

// Polyfill matchMedia used by Mantine (color scheme & hooks)
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
