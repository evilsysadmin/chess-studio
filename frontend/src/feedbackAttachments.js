export const FEEDBACK_IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/gif']);
export const MAX_FEEDBACK_IMAGES = 3;
export const MAX_FEEDBACK_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_FEEDBACK_IMAGES_TOTAL_BYTES = 6 * 1024 * 1024;

export function validateFeedbackFiles(files) {
  const list = Array.from(files || []);
  if (list.length > MAX_FEEDBACK_IMAGES) return `Puedes adjuntar como máximo ${MAX_FEEDBACK_IMAGES} imágenes.`;
  let total = 0;
  for (const file of list) {
    if (!FEEDBACK_IMAGE_TYPES.includes(String(file?.type || '').toLowerCase())) return 'Sólo se admiten imágenes PNG, JPG/JPEG o GIF.';
    const size = Math.max(0, Number(file?.size) || 0);
    if (!size) return 'Una de las imágenes está vacía.';
    if (size > MAX_FEEDBACK_IMAGE_BYTES) return 'Cada imagen puede ocupar como máximo 3 MiB.';
    total += size;
  }
  if (total > MAX_FEEDBACK_IMAGES_TOTAL_BYTES) return 'Los adjuntos no pueden superar 6 MiB en total.';
  return null;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer una de las imágenes.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('No se pudo preparar una de las imágenes.'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function prepareFeedbackAttachments(files) {
  const list = Array.from(files || []);
  const error = validateFeedbackFiles(list);
  if (error) throw new Error(error);
  return Promise.all(list.map(async (file) => ({
    name: String(file.name || 'captura').slice(0, 120),
    mimeType: String(file.type || '').toLowerCase(),
    data: await readFileAsBase64(file),
  })));
}
