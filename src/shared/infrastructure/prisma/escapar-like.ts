/**
 * Prepara un texto del usuario para `contains`/`startsWith` de Prisma.
 *
 * **Prisma no escapa los comodines de `LIKE`** — lo encontró el e2e de
 * búsqueda: `contains: '%'` se traduce a `ILIKE '%%%'` y devuelve todas las
 * filas, y `_` coincide con cualquier carácter. Se escapan con barra
 * invertida, que es el carácter de escape por defecto de `LIKE`/`ILIKE` en
 * Postgres; la propia barra va primero, para no escapar dos veces.
 *
 * No es un problema de seguridad —el valor viaja como parámetro y el filtro de
 * negocio + RLS acotan igual al tenant—, sino de exactitud: el negociante que
 * busca "50%" o "cajón_3" debe encontrar eso, no todo.
 */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
