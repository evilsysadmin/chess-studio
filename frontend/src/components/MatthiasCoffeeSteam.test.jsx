import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MatthiasCoffeeSteam, { matthiasCoffeeSteamSide, matthiasCoffeeSteamTiming } from './MatthiasCoffeeSteam.jsx';

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

  it('da ritmos distintos a las tres volutas para que no parezcan un gif sincronizado', () => {
    const timings = [0, 1, 2].map(matthiasCoffeeSteamTiming);
    expect(new Set(timings.map((timing) => timing.duration)).size).toBe(3);
    expect(timings.some((timing) => timing.delay < 0)).toBe(true);
    expect(timings.every((timing) => timing.duration >= 3000)).toBe(true);
  });

  it('renderiza tres volutas sólo con movimiento permitido', () => {
    const active = renderToStaticMarkup(
      <MatthiasCoffeeSteam scene="time-night-coffee" reducedMotion={false} />,
    );
    expect(active).toContain('data-matthias-coffee-steam="true"');
    expect(active).toContain('data-steam-side="right"');
    expect(active).toContain('data-steam-motion="waiting"');
    expect(active.match(/data-matthias-coffee-wisp="true"/g)).toHaveLength(3);

    const reduced = renderToStaticMarkup(
      <MatthiasCoffeeSteam scene="time-night-coffee" reducedMotion />,
    );
    expect(reduced).toBe('');
  });
});
