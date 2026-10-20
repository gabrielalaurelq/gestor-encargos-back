import { limiteRetencion } from '../../../shared/domain/retencion-tombstones';

/**
 * ¿Puede este dispositivo seguir con un delta desde `since`, o tiene que
 * descartar su base local y resincronizar de cero (`410`)?
 *
 * Un `since` anterior al horizonte de purga **no basta** para decidir: la
 * página 2 de una resincronización completa trae como `since` el corte de la
 * página 1, que en un negocio con historia puede tener más de 90 días. Si eso
 * diera `410`, la app reiniciaría el resync y caería otra vez en el mismo
 * `410`, en bucle. Lo que distingue ese caso del de un dispositivo abandonado
 * es **cuándo llamó por última vez** este dispositivo a `/sync`
 * (`dispositivos.ultima_sync_en`, reloj del servidor).
 *
 * Riesgo real solo si las dos cosas son viejas: el `since` y la última sync.
 * Una última sync desconocida (`null`: dispositivo recién logueado, o fila
 * anterior a esta columna) cuenta como vieja — ante la duda, resincronizar;
 * perder un borrado es irreversible.
 */
export function syncVigente(params: {
  since: Date | null;
  ultimaSync: Date | null;
  ahora: Date;
}): boolean {
  const { since, ultimaSync, ahora } = params;
  if (since === null) {
    return true;
  }
  const limite = limiteRetencion(ahora);
  if (since >= limite) {
    return true;
  }
  return ultimaSync !== null && ultimaSync >= limite;
}
