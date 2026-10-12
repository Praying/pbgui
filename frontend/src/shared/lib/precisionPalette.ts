export const PRECISION_PALETTE = {
  surface: {
    deep: '#091117',
    page: '#0d171e',
    sidebar: '#0b151c',
    input: '#12222c',
    panel: '#172832',
    elevated: '#223945',
  },
  border: {
    subtle: '#263d49',
    default: '#385261',
    strong: '#587080',
  },
  text: {
    primary: '#edf7fa',
    secondary: '#b7cbd2',
    muted: '#89a3ad',
  },
  accent: {
    deep: '#368eae',
    base: '#75c7e5',
    soft: '#a9e0f0',
    contrast: '#061217',
  },
  success: { deep: '#397d5e', base: '#7bc8a5', soft: '#a4dbc3' },
  warning: { deep: '#8a632c', base: '#d8ae6f', soft: '#e5c99b' },
  danger: { deep: '#914343', base: '#d98080', soft: '#e6aaaa' },
  alpha: {
    accentBackground: 'rgb(117 199 229 / 0.14)',
    successBackground: 'rgb(123 200 165 / 0.13)',
    warningBackground: 'rgb(216 174 111 / 0.14)',
    dangerBackground: 'rgb(217 128 128 / 0.13)',
    volumeUp: 'rgb(123 200 165 / 0.35)',
    volumeDown: 'rgb(217 128 128 / 0.35)',
  },
} as const;
