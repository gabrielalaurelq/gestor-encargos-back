import { randomUUID } from 'node:crypto';
import { NotaTextoVacioError } from './errores';

export interface DatosNuevaNota {
  id?: string;
  texto: string;
}

/**
 * Nota: registro fechado dentro del encargo (Doc 2). **Inmutable una vez
 * creada** (invariante 16): no se edita ni se borra, y por eso el Doc 5 no
 * define `PATCH` ni `DELETE`. Tampoco hay `aplicar()` acá — la inmutabilidad
 * se expresa como ausencia de métodos, no como una validación que se pueda
 * olvidar.
 *
 * `fecha` la asigna el servidor, nunca el cliente.
 */
export class Nota {
  private constructor(
    readonly id: string,
    readonly texto: string,
    readonly fecha: Date,
    readonly creadoEn?: Date,
    readonly actualizadoEn?: Date,
  ) {}

  static crear(datos: DatosNuevaNota, hoy: Date): Nota {
    const texto = datos.texto.trim();
    if (texto === '') {
      throw new NotaTextoVacioError();
    }
    return new Nota(datos.id ?? randomUUID(), texto, hoy);
  }

  static reconstituir(fila: {
    id: string;
    texto: string;
    fecha: Date;
    creadoEn: Date;
    actualizadoEn: Date;
  }): Nota {
    return new Nota(fila.id, fila.texto, fila.fecha, fila.creadoEn, fila.actualizadoEn);
  }
}
