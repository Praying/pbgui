import { describe, expect, it } from 'vitest';
import { PRECISION_PALETTE } from './precisionPalette';

describe('PRECISION_PALETTE', () => {
  it('exposes the complete approved immutable palette', () => {
    expect(PRECISION_PALETTE).toEqual({
      surface: {
        deep: '#0f0f0f',
        page: '#161616',
        sidebar: '#1b1b1b',
        input: '#1e1e1e',
        panel: '#222222',
        elevated: '#2b2b2b',
      },
      border: {
        subtle: '#343434',
        default: '#464646',
        strong: '#626262',
      },
      text: {
        primary: '#f0f0f0',
        secondary: '#bdbdbd',
        muted: '#999999',
      },
      accent: {
        deep: '#4fa8d3',
        base: '#8fcff2',
        soft: '#b6e1f7',
        contrast: '#081216',
      },
      success: {
        deep: '#397d5e',
        base: '#7bc8a5',
        soft: '#a4dbc3',
      },
      warning: {
        deep: '#8a632c',
        base: '#d8ae6f',
        soft: '#e5c99b',
      },
      danger: {
        deep: '#914343',
        base: '#d98080',
        soft: '#e6aaaa',
      },
      alpha: {
        accentBackground: 'rgb(143 207 242 / 0.14)',
        successBackground: 'rgb(123 200 165 / 0.13)',
        warningBackground: 'rgb(216 174 111 / 0.14)',
        dangerBackground: 'rgb(217 128 128 / 0.13)',
        volumeUp: 'rgb(123 200 165 / 0.35)',
        volumeDown: 'rgb(217 128 128 / 0.35)',
      },
    });
  });
});
