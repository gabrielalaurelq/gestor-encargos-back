/**
 * La implementación de un repositorio la lanza cuando el `id` que trae una
 * alta ya está tomado. Existe para que los casos de uso puedan reaccionar sin
 * conocer los códigos de error de Prisma (P2002) — la regla de dependencias
 * del Doc 8 Bloque 1.
 */
export class RecursoDuplicadoError extends Error {
  constructor(
    readonly recurso: string,
    readonly id: string,
  ) {
    super(`Ya existe un registro de ${recurso} con el id ${id}.`);
    this.name = 'RecursoDuplicadoError';
  }
}
