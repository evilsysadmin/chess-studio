import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WarRoomCapturedPieces, { warRoomCaptureSummary } from './WarRoomCapturedPieces.jsx';

const history = [
  { color: 'w', captured: 'p', san: 'exd5' },
  { color: 'b', captured: 'n', san: 'Bxf3' },
  { color: 'w', captured: 'r', san: 'Rxa8' },
  { color: 'w', captured: 'p', flags: 'e', san: 'exd6' },
];

describe('War Room collapsible captured pieces', () => {
  it('counts material from confirmed history, including en passant', () => {
    expect(warRoomCaptureSummary(history, 'w')).toMatchObject({
      total: 4, unknownCount: 0, difference: 4,
    });
    expect(warRoomCaptureSummary(history, 'w').playerEntries.map((entry) => entry.glyph))
      .toEqual(['♟', '♜', '♟']);
    expect(warRoomCaptureSummary(history, 'w').opponentEntries.map((entry) => entry.glyph))
      .toEqual(['♘']);
  });

  it('reverses ownership for a human playing black without reversing the piece colours', () => {
    const summary = warRoomCaptureSummary(history, 'b');
    expect(summary.difference).toBe(-4);
    expect(summary.playerEntries.map((entry) => entry.glyph)).toEqual(['♘']);
    expect(summary.opponentEntries.map((entry) => entry.glyph)).toEqual(['♟', '♜', '♟']);
  });

  it('never guesses the side of malformed legacy captures', () => {
    const summary = warRoomCaptureSummary([
      { captured: 'q', san: 'Qxd8' }, { color: 'w', captured: 'p', san: 'exd5' },
    ], 'w');
    expect(summary.unknownCount).toBe(1);
    expect(summary.total).toBe(1);
    expect(summary.difference).toBe(1);
  });

  it('re-derives from the latest history after undo or a fresh game', () => {
    const previous = warRoomCaptureSummary(history);
    expect(warRoomCaptureSummary(history.slice(0, 2)).total).toBe(2);
    expect(warRoomCaptureSummary(history.slice(0, 2)).difference).toBe(-2);
    expect(warRoomCaptureSummary([])).toMatchObject({ total: 0, difference: 0 });
    expect(previous.total).toBe(4);
    expect(warRoomCaptureSummary(null).total).toBe(0);
  });

  it('recovers real captured piece from backend boolean moves with no colour field', () => {
    const booleanHistory = [
      { from: 'e2', to: 'e4', captured: false, by: 'human' },
      { from: 'd7', to: 'd5', captured: false, by: 'cpu' },
      { from: 'e4', to: 'd5', captured: true, by: 'human', san: 'exd5' },
      { from: 'g8', to: 'f6', captured: false, by: 'cpu' },
    ];
    expect(warRoomCaptureSummary(booleanHistory, 'w')).toMatchObject({
      total: 1, difference: 1, unknownCount: 0,
    });
    expect(warRoomCaptureSummary(booleanHistory, 'w').playerEntries[0].glyph).toBe('♟');
  });

  it('correctly reconstructs en passant from moves rather than destination occupancy', () => {
    const booleanHistory = [
      { from: 'e2', to: 'e4' }, { from: 'a7', to: 'a6' },
      { from: 'e4', to: 'e5' }, { from: 'd7', to: 'd5' },
      { from: 'e5', to: 'd6', captured: true },
    ];
    expect(warRoomCaptureSummary(booleanHistory, 'w')).toMatchObject({
      total: 1, difference: 1, unknownCount: 0,
    });
  });

  it('does not claim an unprovable boolean capture is a particular piece', () => {
    const summary = warRoomCaptureSummary([
      { from: 'e4', to: 'd5', captured: true },
    ], 'w');
    expect(summary).toMatchObject({ total: 0, unknownCount: 1, difference: 0 });
  });

  it('is closed by default, has an accessible toggle and does not consume board UI', () => {
    const html = renderToStaticMarkup(
      <WarRoomCapturedPieces game={{ id: 'game-1', history }} humanColor="w" />,
    );
    expect(html).toContain('data-warroom-captures="true"');
    expect(html).toContain('aria-label="Registro de capturas"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="warroom-captures-detail"');
    expect(html).toContain('aria-label="Mostrar capturas"');
    expect(html).not.toContain('warroom-captures-panel');
    expect(html).not.toContain('Tus capturas');
  });
});
