import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import AchievementsModal from './AchievementsModal.jsx';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('chess-study-achievements', JSON.stringify(['feat_mate', 'feat_pawn_queen']));
});

describe('AchievementsModal · Logros 2.0', () => {
  it('identifica logros antiguos como legado sin inventar su historia', () => {
    render(<AchievementsModal onClose={() => {}} />);
    expect(screen.getAllByText(/Registro legado · el origen exacto no se reconstruye/i).length).toBeGreaterThan(0);
  });

  it('permite fijar un logro desbloqueado en la vitrina', () => {
    render(<AchievementsModal onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Fijar Cierre por derribo como favorito/i })[0]);
    expect(screen.getByText(/Tu vitrina · 1\/3/i)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('chess-study-achievement-favorites-v1'))).toEqual(['feat_mate']);
  });
});
