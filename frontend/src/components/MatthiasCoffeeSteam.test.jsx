import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasCoffeeSteam, { matthiasCoffeeSteamSide } from './MatthiasCoffeeSteam.jsx';

describe('MatthiasCoffeeSteam', () => {
  it('ancla el vapor al lado real de cada taza', () => {
    expect(matthiasCoffeeSteamSide('time-morning-coffee')).toBe('left');
    expect(matthiasCoffeeSteamSide('time-breakfast-news')).toBe('left');
    expect(matthiasCoffeeSteamSide('coffee')).toBe('left');
    expect(matthiasCoffeeSteamSide('time-night-coffee')).toBe('right');
    expect(matthiasCoffeeSteamSide('night')).toBe('right');
  });

  it('no convierte la cerveza ni escenas sin café en bebida humeante', () => {
    expect(matthiasCoffeeSteamSide('time-beer-break')).toBeNull();
    expect(matthiasCoffeeSteamSide('time-lunch-bocata')).toBeNull();
    expect(matthiasCoffeeSteamSide('strategy-book')).toBeNull();
  });

  it('renderiza tres volutas continuas sólo con movimiento permitido', () => {
    const active = renderToStaticMarkup(
      <MatthiasCoffeeSteam scene="time-night-coffee" reducedMotion={false} />,
    );
    expect(active).toContain('data-matthias-coffee-steam="true"');
    expect(active).toContain('data-steam-side="right"');
    expect(active.match(/matthias-coffee-steam__wisp/g)).toHaveLength(3);

    const reduced = renderToStaticMarkup(
      <MatthiasCoffeeSteam scene="time-night-coffee" reducedMotion />,
    );
    expect(reduced).toBe('');
  });
});
