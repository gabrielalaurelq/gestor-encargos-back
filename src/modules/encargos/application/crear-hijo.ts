import { NotFoundException } from '@nestjs/common';
import { conflictoIdAjeno } from '../../../shared/application/crear-idempotente';
import { RecursoDuplicadoError } from '../../../shared/domain/recurso-duplicado.error';
import { Encargo } from '../domain/encargo';
import { EncargoRepository, EscriturasHijos } from '../domain/repositories/encargo.repository';

export interface ResultadoHijo<T> {
  hijo: T;
  /** La raíz con los derivados ya recalculados (Doc 5: el Trabajo + el precio_total). */
  encargo: Encargo;
  /** `false` cuando el id ya existía: la respuesta es 200, no 201. */
  creado: boolean;
}

export interface OpcionesHijo<T> {
  repositorio: EncargoRepository;
  encargoId: string;
  /** UUID generado en el dispositivo; `undefined` si lo genera el servidor. */
  id?: string;
  /** Lee el hijo por id dentro de la transacción, para el pre-chequeo. */
  leer: (hijos: EscriturasHijos, id: string) => Promise<T | null>;
  /** Valida y escribe el hijo. Puede lanzar errores de dominio (422). */
  escribir: (hijos: EscriturasHijos, encargo: Encargo) => Promise<T>;
}

/**
 * Alta idempotente de un hijo del agregado, con la misma semántica que
 * `crearIdempotente` (Doc 5 Bloque 1: el `id` lo manda el dispositivo y un
 * reintento de la cola Outbox devuelve `200` con lo que ya había).
 *
 * **Por qué no reutiliza `crearIdempotente` tal cual.** Ese helper, al chocar
 * contra la llave primaria, relee para decidir entre `200` y `409`. Acá la
 * escritura vive dentro de una transacción interactiva, y en Postgres un error
 * la deja abortada: cualquier consulta posterior dentro de ella falla. Así que
 * la relectura tiene que ocurrir **fuera**, y la forma más limpia es reintentar
 * la transacción completa: en la segunda pasada el pre-chequeo encuentra la
 * fila que escribió el otro reintento. La decisión del `409` sí es compartida
 * (`conflictoIdAjeno`), para que el texto y el criterio no se bifurquen.
 */
export async function crearHijo<T>(opciones: OpcionesHijo<T>): Promise<ResultadoHijo<T>> {
  const { repositorio, encargoId, id, leer, escribir } = opciones;

  const intentar = () =>
    repositorio.mutarAgregado(encargoId, async (hijos, encargo) => {
      if (id) {
        const existente = await leer(hijos, id);
        if (existente) {
          // Un reintento no es una edición: se devuelve lo guardado tal cual.
          return { hijo: existente, creado: false };
        }
      }
      return { hijo: await escribir(hijos, encargo), creado: true };
    });

  let mutacion;
  try {
    mutacion = await intentar();
  } catch (error) {
    if (!(error instanceof RecursoDuplicadoError)) {
      throw error;
    }

    // Carrera entre dos reintentos simultáneos: el que perdió vuelve a
    // intentarlo y su pre-chequeo encuentra lo que escribió el otro.
    mutacion = await intentar().catch((segundo) => {
      // Si vuelve a chocar, la fila existe pero esta sesión no la ve: el id
      // pertenece a otro negocio.
      throw segundo instanceof RecursoDuplicadoError ? conflictoIdAjeno() : segundo;
    });
  }

  if (!mutacion) {
    throw new NotFoundException('El encargo no existe.');
  }

  return {
    hijo: mutacion.resultado.hijo,
    encargo: mutacion.encargo,
    creado: mutacion.resultado.creado,
  };
}
