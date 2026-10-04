/**
 * Margen de solape, en milisegundos.
 *
 * **Por qué existe.** `actualizado_en` lo escribe Prisma con el reloj de la
 * aplicación **en el momento de la escritura**, no en el del commit — está
 * comprobado contra esta base: una transacción que tardó 2 s en confirmar dejó
 * `actualizado_en = 22:24:04.003` y se hizo visible a las `22:24:06.013`. El
 * orden de los timestamps no coincide con el orden de visibilidad.
 *
 * Sin margen, se pierden filas en silencio: una sincronización a las 22:24:05
 * no ve esa fila, devuelve `servidor_timestamp = 22:24:05`, y la próxima pide
 * `>= 22:24:05`. La fila tiene `22:24:04.003`. **No vuelve a aparecer nunca.**
 * El Doc 5 razonó sobre una carrera parecida —por eso manda guardar
 * `servidor_timestamp` y no el máximo `actualizado_en`—, pero esa precaución no
 * cubre este caso: el problema no es qué marca guarda el cliente, sino que
 * `actualizado_en` no está ordenado por visibilidad.
 *
 * **Por qué 10 s y no otro número.** Prisma aborta cualquier transacción
 * interactiva que pase de 5 s, así que la distancia entre la escritura y su
 * commit está acotada ahí. 10 s es el doble, y además absorbe el desfase de
 * reloj entre instancias del backend si algún día hay más de una.
 *
 * **Lo que cuesta.** Cada sincronización reenvía las filas de esos 10 s. En un
 * motor Last-Write-Wins aplicar dos veces el mismo cambio da el mismo
 * resultado, así que reenviar es inofensivo y perder es irreversible: ante
 * cualquier ambigüedad, reenviar.
 *
 * **El límite que sigue abierto:** si el reloj del servidor salta hacia atrás
 * (un ajuste de NTP mayor que el margen), ningún esquema basado en timestamps
 * aguanta. La solución definitiva sería ordenar por commit real (`xmin` o una
 * secuencia), lo que cambia el contrato del Doc 5 y pide migrar 9 tablas.
 */
export const MARGEN_SOLAPE_MS = 10_000;

export interface EntradaSiguienteSince {
  /** Reloj de la aplicación al empezar a atender la petición. */
  inicio: Date;
  /**
   * Si alguna colección se truncó, el `actualizado_en` más antiguo entre las
   * últimas filas enviadas de las colecciones truncadas. `null` si no se
   * truncó nada.
   */
  corte: Date | null;
}

export interface SiguienteSince {
  servidorTimestamp: Date;
  hasMore: boolean;
}

/**
 * Calcula la marca que el dispositivo guardará como su próximo `since`.
 *
 * Se usa el reloj de la **aplicación** y no `now()` de Postgres a propósito:
 * es el mismo reloj que escribe `actualizado_en`, así que comparar ambos no
 * introduce desfase entre relojes distintos.
 *
 * Si hubo truncamiento, la marca no avanza más allá del corte: las filas que
 * no entraron tienen que seguir cayendo dentro del rango de la próxima
 * petición. Y como `since` se compara de forma **inclusiva** (`>=`), las filas
 * con exactamente ese timestamp se reenvían en vez de saltarse.
 */
export function calcularSiguienteSince(entrada: EntradaSiguienteSince): SiguienteSince {
  const conMargen = new Date(entrada.inicio.getTime() - MARGEN_SOLAPE_MS);

  if (entrada.corte === null) {
    return { servidorTimestamp: conMargen, hasMore: false };
  }

  // El corte nunca puede quedar por delante de la marca normal: si lo hiciera,
  // el solape dejaría de proteger.
  const servidorTimestamp = entrada.corte < conMargen ? entrada.corte : conMargen;
  return { servidorTimestamp, hasMore: true };
}
