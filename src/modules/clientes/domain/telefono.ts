import { TelefonoInvalidoError } from './errores';

// E.164: un `+`, un código de país que nunca empieza en 0, y entre 7 y 15
// dígitos en total (el máximo lo fija la propia norma). Perú entra como
// +51 seguido de 9 dígitos = 11.
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Value Object Teléfono (Doc 2, sección Value Objects): inmutable, se
 * autovalida y su igualdad es por valor.
 *
 * **Decisión (no estaba en los Docs):** el backend exige E.164 ya formado y
 * rechaza cualquier otra cosa; no normaliza "987654321" a "+51987654321".
 * Normalizar obligaría al backend a adivinar el país, y el Doc 1 (módulo 1)
 * ya pone esa decisión en la UI: teclado peruano de 9 dígitos por defecto,
 * con un toggle explícito para números internacionales. Una sola verdad.
 */
export class Telefono {
  private constructor(readonly valor: string) {}

  static crear(valor: string): Telefono {
    const limpio = valor.trim();
    if (!E164.test(limpio)) {
      throw new TelefonoInvalidoError(valor);
    }
    return new Telefono(limpio);
  }

  /** `null`/`undefined`/cadena vacía → sin teléfono (Doc 2, invariante 18). */
  static crearOpcional(valor: string | null | undefined): Telefono | null {
    if (valor === null || valor === undefined || valor.trim() === '') {
      return null;
    }
    return Telefono.crear(valor);
  }

  /** E.164 sin el `+`, como lo pide el deep link de WhatsApp (Doc 10, punto 13). */
  get digitos(): string {
    return this.valor.slice(1);
  }

  equals(otro: Telefono | null | undefined): boolean {
    return otro instanceof Telefono && otro.valor === this.valor;
  }

  toString(): string {
    return this.valor;
  }
}
