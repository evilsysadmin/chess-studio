import { describe, expect, it } from 'vitest';
import {
  MAX_FEEDBACK_IMAGE_BYTES,
  validateFeedbackFiles,
} from './feedbackAttachments.js';

describe('adjuntos de feedback', () => {
  it('acepta exclusivamente png/jpeg/gif dentro de los límites', () => {
    expect(validateFeedbackFiles([
      { name: 'uno.png', type: 'image/png', size: 1200 },
      { name: 'dos.jpg', type: 'image/jpeg', size: 2300 },
      { name: 'tres.gif', type: 'image/gif', size: 900 },
    ])).toBeNull();
    expect(validateFeedbackFiles([{ name: 'vector.svg', type: 'image/svg+xml', size: 100 }])).toMatch(/PNG/);
    expect(validateFeedbackFiles([{ name: 'enorme.png', type: 'image/png', size: MAX_FEEDBACK_IMAGE_BYTES + 1 }])).toMatch(/3 MiB/);
  });

  it('limita cantidad y peso total antes de leer base64', () => {
    expect(validateFeedbackFiles(Array.from({ length: 4 }, (_, i) => ({ name: `${i}.png`, type: 'image/png', size: 10 })))).toMatch(/máximo 3/);
    expect(validateFeedbackFiles([
      { name: 'a.png', type: 'image/png', size: 3 * 1024 * 1024 },
      { name: 'b.png', type: 'image/png', size: 3 * 1024 * 1024 },
    ])).toBeNull();
  });
});
