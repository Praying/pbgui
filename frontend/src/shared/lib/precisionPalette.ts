export const PRECISION_PALETTE = {
  surface: {
    deep: '#0b0c0e',
    page: '#111215',
    sidebar: '#0e0f12',
    input: '#181a1e',
    panel: '#1c1e23',
    elevated: '#2d3037',
  },
  border: {
    subtle: '#2a2d33',
    default: '#3a3e46',
    strong: '#565b66',
  },
  text: {
    primary: '#eceef1',
    secondary: '#b4b9c2',
    muted: '#9298a4',
  },
  accent: {
    deep: '#3b7fd1',
    base: '#6aaeff',
    soft: '#a5cfff',
    contrast: '#07111f',
  },
  success: { deep: '#2f7a5a', base: '#62c49a', soft: '#9be0c0' },
  warning: { deep: '#8a6a22', base: '#e0b45a', soft: '#efd08e' },
  danger: { deep: '#a14545', base: '#ee7b7b', soft: '#f6a9a9' },
  alpha: {
    accentBackground: 'rgb(106 174 255 / 0.14)',
    successBackground: 'rgb(98 196 154 / 0.13)',
    warningBackground: 'rgb(224 180 90 / 0.14)',
    dangerBackground: 'rgb(238 123 123 / 0.13)',
    volumeUp: 'rgb(98 196 154 / 0.35)',
    volumeDown: 'rgb(238 123 123 / 0.35)',
  },
} as const;
