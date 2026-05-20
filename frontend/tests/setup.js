import '@testing-library/jest-dom/vitest';

// Stub minimo de matchMedia para componentes que lo consulten (recharts, etc).
if (!window.matchMedia) {
  window.matchMedia = (q) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
