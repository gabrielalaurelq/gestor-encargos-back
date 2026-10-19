import { Injectable } from '@nestjs/common';
import { Cliente } from '../../clientes/domain/cliente';
import { ClienteRepository } from '../../clientes/domain/repositories/cliente.repository';
import { Encargo } from '../../encargos/domain/encargo';
import { EncargoRepository } from '../../encargos/domain/repositories/encargo.repository';

/**
 * Tope por grupo. El contrato (Doc 5 Bloque 4) no pagina esta respuesta, y la
 * búsqueda "en tiempo real" del PRD 16 la hace la app sobre su base local
 * (Drift): este endpoint es el respaldo en línea, así que basta con lo más
 * relevante. 20 es la misma página por defecto del resto de listados.
 */
export const RESULTADOS_POR_GRUPO = 20;

export interface ResultadoBusqueda {
  clientes: Cliente[];
  encargos: Encargo[];
}

/**
 * Búsqueda global (PRD 16): consulta a la vez Clientes (nombre/teléfono) y
 * Encargos (descripción/ubicación física) y devuelve los dos grupos por
 * separado — el PRD pide no obligar a elegir de antemano qué se busca.
 *
 * Reutiliza los repositorios de los dos agregados en vez de un repositorio
 * propio: cada uno ya sabe buscar sobre sus índices de trigramas, y así el
 * criterio de coincidencia de clientes es exactamente el de `GET /clientes?q=`.
 */
@Injectable()
export class BuscarUseCase {
  constructor(
    private readonly clientes: ClienteRepository,
    private readonly encargos: EncargoRepository,
  ) {}

  async execute(q: string): Promise<ResultadoBusqueda> {
    const [clientes, encargos] = await Promise.all([
      this.clientes.listar({ q, pagina: 1, porPagina: RESULTADOS_POR_GRUPO }),
      // Sin filtro de estado: entregados y cancelados también (Caso 8).
      this.encargos.listar({ q, orden: 'recientes', pagina: 1, porPagina: RESULTADOS_POR_GRUPO }),
    ]);
    return { clientes: clientes.datos, encargos: encargos.datos };
  }
}
