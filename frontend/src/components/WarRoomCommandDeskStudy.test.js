import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyWarRoomCommandDeskStudy,
  WAR_ROOM_COMMAND_DESK_STUDY_VERSION,
} from './WarRoomCommandDeskStudy.js';

function makeDeskRoom() {
  const root = new THREE.Group();
  const desk = new THREE.Group();
  desk.name = 'command-cabinet';
  const art = new THREE.Group();
  art.name = 'war-room-teutonic-command-desk-v28';
  desk.add(art);
  root.add(desk);
  return { root, desk, art };
}

describe('War Room command desk chess study', () => {
  it('matches the approved desk mock: centred board, full army and one stacked reference pile at the left', () => {
    const { root, desk, art } = makeDeskRoom();
    expect(applyWarRoomCommandDeskStudy(root, { towardBoard: 1 })).toBe(1);

    const study = art.getObjectByName('war-room-command-desk-chess-study');
    expect(study).toBeTruthy();
    expect(study.userData.warRoomStudyVersion).toBe(WAR_ROOM_COMMAND_DESK_STUDY_VERSION);
    expect(study.userData.warRoomStudyPurpose).toBe('centered-chessboard-with-stacked-reference-books');

    const board = study.getObjectByName('war-room-command-desk-analysis-board');
    expect(board).toBeTruthy();
    expect(board.position.x).toBeCloseTo(0, 6);
    expect(board.userData.commandDeskRole).toBe('centered-analysis-board');
    expect(board.userData.commandDeskCenterX).toBe(0);

    const lightSquares = study.getObjectByName('war-room-command-desk-analysis-light-squares');
    const darkSquares = study.getObjectByName('war-room-command-desk-analysis-dark-squares');
    expect(lightSquares?.isInstancedMesh).toBe(true);
    expect(darkSquares?.isInstancedMesh).toBe(true);
    expect(lightSquares?.count).toBe(32);
    expect(darkSquares?.count).toBe(32);

    const pieces = [];
    study.traverse((object) => {
      if (object.name === 'war-room-command-desk-study-piece') pieces.push(object);
    });
    expect(pieces).toHaveLength(32);
    expect(new Set(pieces.map((piece) => piece.userData.studyKind))).toEqual(
      new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']),
    );

    const books = study.getObjectByName('war-room-command-desk-chess-reference-books');
    expect(books).toBeTruthy();
    expect(books.userData.referenceSubjects).toEqual(['aperturas', 'tactica', 'finales', 'partidas-anotadas']);
    expect(books.userData.commandDeskRole).toBe('left-stacked-reference-books');

    const volumes = [];
    books.traverse((object) => {
      if (object.name?.startsWith('war-room-command-desk-reference-volume-')) volumes.push(object);
    });
    expect(volumes).toHaveLength(4);
    expect(volumes.every((volume) => volume.position.x < -0.75)).toBe(true);
    expect(volumes.map((volume) => volume.position.y)).toEqual(
      [...volumes]
        .sort((a, b) => a.userData.referenceStackIndex - b.userData.referenceStackIndex)
        .map((volume) => volume.position.y),
    );
    for (let index = 1; index < volumes.length; index += 1) {
      expect(volumes[index].position.y).toBeGreaterThan(volumes[index - 1].position.y);
    }

    expect(study.getObjectByName('war-room-command-desk-open-chess-manual-left')).toBeFalsy();
    expect(study.getObjectByName('war-room-command-desk-open-chess-manual-right')).toBeFalsy();
    expect(study.getObjectByName('war-room-command-desk-reference-emblem-horizontal')).toBeTruthy();
    expect(study.getObjectByName('war-room-command-desk-reference-emblem-vertical')).toBeTruthy();
    expect(desk.userData.warRoomCommandDeskStudy).toBe(WAR_ROOM_COMMAND_DESK_STUDY_VERSION);

    expect(applyWarRoomCommandDeskStudy(root, { towardBoard: 1 })).toBe(0);
  });

  it('keeps the extra desk geometry off the coarse/mobile scene', () => {
    const { root, art } = makeDeskRoom();
    expect(applyWarRoomCommandDeskStudy(root, { towardBoard: 1, coarsePointer: true })).toBe(0);
    expect(art.getObjectByName('war-room-command-desk-chess-study')).toBeFalsy();
  });
});
