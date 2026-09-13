function joinNames(names) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

export function chroniclesBookOneEpilogue(state) {
  const party = Array.isArray(state?.party) ? state.party : [];
  const survivors = party.filter((member) => Number(member.hp || 0) > 0);
  const fallen = party.filter((member) => Number(member.hp || 0) <= 0);
  const survivorNames = joinNames(survivors.map((member) => member.name));
  const fallenNames = joinNames(fallen.map((member) => member.name));
  const hasLantern = Boolean(state?.spectralLantern);
  const hasKey = Boolean(state?.blackGateKey);

  let title = 'La compañía completa';
  if (fallen.length === 0 && hasLantern) title = 'Cuatro piezas y una luz robada';
  else if (fallen.length === 1) title = 'Una silla queda vacía';
  else if (fallen.length > 1) title = 'La cripta cobra su peaje';

  const departure = survivorNames
    ? `Cruzan la puerta negra ${survivorNames}. La cripta se queda detrás, ofendida por la falta de cadáveres suficientes.`
    : 'La puerta negra se abre. No queda nadie en pie para discutir si eso cuenta como victoria.';

  const fallenLine = fallen.length
    ? `${fallenNames} ${fallen.length === 1 ? 'queda' : 'quedan'} escrito${fallen.length === 1 ? '' : 's'} en el margen de este libro.`
    : 'Nadie queda atrás. Matthias considera el dato estadísticamente sospechoso.';

  const lanternLine = hasLantern
    ? 'El Farol Espectral sale de la cripta con la compañía; su luz ya no pertenece a la capilla.'
    : 'La luz verdosa de la capilla permanece donde estaba. Algunas reliquias sobreviven precisamente porque nadie las toca.';

  const keyLine = hasKey
    ? 'La Llave Negra vuelve a manos del grupo después de su breve carrera profesional dentro del bolsillo de un caballo.'
    : 'La Llave Negra no figura entre los objetos recuperados.';

  let verdict = 'Cuatro entramos. Cuatro salimos. Me preocupa profundamente el precedente.';
  if (fallen.length === 1) verdict = `${fallenNames} no cruza la puerta. Tres sí. No pienso llamar barato a este final.`;
  else if (fallen.length > 1) verdict = `${survivors.length} salimos de pie. El libro pesa más que al entrar, y no es por el papel.`;

  return {
    title,
    survivors,
    fallen,
    departure,
    fallenLine,
    lanternLine,
    keyLine,
    verdict,
    hasLantern,
    hasKey,
  };
}
