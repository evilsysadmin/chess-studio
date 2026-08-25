export function orderOpeningLessons(lessons = []) {
  return [...lessons].sort((a, b) => {
    const aDefense = /^Defensa\b/i.test(a.title) ? 1 : 0;
    const bDefense = /^Defensa\b/i.test(b.title) ? 1 : 0;
    return aDefense - bDefense || a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
  });
}
