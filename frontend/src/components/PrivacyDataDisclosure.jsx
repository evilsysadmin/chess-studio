import { loadNarrativeCallLedger } from '../narrativeCallLedger.js';
import { storageHealthSnapshot } from '../safeStorage.js';

function providerLabel(provider) {
  if (provider === 'cloudflare') return 'Workers AI';
  if (provider === 'local') return 'fallback local del backend';
  if (provider === 'transport-error') return 'error de transporte';
  if (String(provider || '').startsWith('http-')) return `backend ${provider}`;
  return provider || 'sin proveedor';
}

function storageHealthLabel(area) {
  if (area?.memoryFallbackActive) return `fallback de memoria activo · ${area.pendingOverrides} cambio${area.pendingOverrides === 1 ? '' : 's'} sin confirmar en Web Storage`;
  if (area?.readable) return 'persistencia nativa disponible';
  return 'Web Storage nativo no disponible';
}

export default function PrivacyDataDisclosure() {
  const aiRows = loadNarrativeCallLedger();
  const lastAiCall = aiRows.at(-1) || null;
  const storageHealth = storageHealthSnapshot();

  return (
    <section data-privacy-data-disclosure="v1">
      <h3>Datos y servicios</h3>
      <p className="hint-text">Qué puede salir de este dispositivo y qué se queda aquí. Sin letra pequeña creativa.</p>

      <details className="friendly-disclosure">
        <summary>Backend de Chess Studio</summary>
        <div className="friendly-disclosure-body">
          <p>La app usa el backend autenticado para cuenta, sincronización del perfil/progreso, partidas y presencia necesaria para las funciones conectadas.</p>
          <p>El token de sesión viaja como cabecera de autenticación hacia ese backend; no se añade dentro del payload narrativo enviado a la IA.</p>
        </div>
      </details>

      <details className="friendly-disclosure">
        <summary>Workers AI y narrativa</summary>
        <div className="friendly-disclosure-body">
          <p>Cuando una función pide narrativa remota, el frontend envía al backend un objeto estructurado con tipo de tarea, variante de petición, hechos relevantes, tono e idioma. Los hechos pueden incluir estadísticas o una posición necesaria para esa tarea.</p>
          <p>El ledger local guarda sólo fecha, tipo de tarea, proveedor, tamaños aproximados y éxito. No guarda prompt, facts, FEN, SAN, JWT ni el texto generado.</p>
          <p><b>{aiRows.length}</b> llamadas recientes registradas localmente{lastAiCall ? ` · última: ${providerLabel(lastAiCall.provider)}` : ''}.</p>
        </div>
      </details>

      <details className="friendly-disclosure">
        <summary>Almacenamiento local</summary>
        <div className="friendly-disclosure-body">
          <p><b>Perfil y progreso:</b> {storageHealthLabel(storageHealth.local)}.</p>
          <p><b>Sesión de esta pestaña:</b> {storageHealthLabel(storageHealth.session)}.</p>
          <p>Si aparece el fallback de memoria, la pestaña puede seguir funcionando, pero esos cambios concretos todavía no están confirmados en el almacenamiento persistente del navegador.</p>
        </div>
      </details>

      <details className="friendly-disclosure">
        <summary>Telemetría técnica</summary>
        <div className="friendly-disclosure-body">
          <p>La telemetría del frontend se limita a tipo de evento, contexto grueso de pantalla, release y, cuando aplica, un Web Vital con su valor o el nombre saneado de un error.</p>
          <p>Ese payload técnico no incluye FEN, lista de jugadas, texto narrativo, contraseña ni token.</p>
        </div>
      </details>

      <small>El retrato de jugador, el plan de entrenamiento generado y este ledger se conservan como caché local derivada y se limpian al cambiar la identidad local.</small>
    </section>
  );
}