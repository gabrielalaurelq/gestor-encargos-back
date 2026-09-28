import { DomainError } from './domain-error';

export class MontoInvalidoError extends DomainError {
  readonly codigo = 'MONTO_INVALIDO';

  constructor(valor: unknown, motivo: string) {
    super(`Monto inválido: ${motivo}`, { monto_recibido: valor });
  }
}

// Doc 4: todas las columnas de dinero son DECIMAL(10,2) → hasta 8 dígitos
// enteros y exactamente 2 decimales.
const PATRON = /^(-?)(\d{1,8})(?:\.(\d{1,2}))?$/;
const CENTIMOS_POR_SOL = 100;

/**
 * Value Object Monto (Doc 2). Decimal + moneda; siempre PEN, porque el Doc 0
 * no contempla multi-moneda en el MVP.
 *
 * **Se guarda en céntimos enteros**, no en `number` decimal ni en
 * `Prisma.Decimal`:
 *   - un `number` con decimales arrastra error binario (0.1 + 0.2 ≠ 0.3), y
 *     acá se suman precios para calcular `precio_total` y `saldo_pendiente`;
 *   - `Prisma.Decimal` resolvería la exactitud pero metería un import de
 *     Prisma en la capa `domain/`, que el Doc 8 Bloque 1 prohíbe.
 * Con DECIMAL(10,2) el máximo en céntimos es 9_999_999_999, muy por debajo
 * del entero exacto de JavaScript (2^53), así que la conversión es segura.
 *
 * **No restringe el signo** (Doc 2, decisión de diseño explícita): el precio
 * de un Trabajo nunca es negativo, pero el saldo pendiente de un Encargo sí
 * puede serlo. Cada entidad aplica su propia regla.
 */
export class Monto {
  static readonly MONEDA = 'PEN';

  private constructor(readonly centimos: number) {}

  static readonly CERO = new Monto(0);

  /**
   * Acepta el número que llega en el JSON o el string que devuelve la base.
   * Rechaza más de 2 decimales en vez de redondear: redondear dinero en
   * silencio esconde un error del cliente.
   */
  static desde(valor: number | string): Monto {
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
      throw new MontoInvalidoError(valor, 'no es un número finito.');
    }

    // String(20.5) === '20.5'. Se evita toFixed() a propósito: redondearía.
    const texto = String(valor).trim();
    const partes = PATRON.exec(texto);
    if (!partes) {
      throw new MontoInvalidoError(
        valor,
        'debe ser un número con hasta 8 dígitos enteros y 2 decimales.',
      );
    }

    const [, signo, enteros, decimales = ''] = partes;
    const centimos =
      Number(enteros) * CENTIMOS_POR_SOL + Number(decimales.padEnd(2, '0').slice(0, 2));

    return new Monto(signo === '-' ? -centimos : centimos);
  }

  static desdeCentimos(centimos: number): Monto {
    if (!Number.isSafeInteger(centimos)) {
      throw new MontoInvalidoError(centimos, 'los céntimos deben ser un entero.');
    }
    return new Monto(centimos);
  }

  /** Valor en soles, apto para JSON (Doc 5 usa números, no strings). */
  get soles(): number {
    return this.centimos / CENTIMOS_POR_SOL;
  }

  /** Representación con 2 decimales, como la espera DECIMAL(10,2). */
  get texto(): string {
    return this.soles.toFixed(2);
  }

  get esNegativo(): boolean {
    return this.centimos < 0;
  }

  get esCero(): boolean {
    return this.centimos === 0;
  }

  sumar(otro: Monto): Monto {
    return new Monto(this.centimos + otro.centimos);
  }

  restar(otro: Monto): Monto {
    return new Monto(this.centimos - otro.centimos);
  }

  mayorQue(otro: Monto): boolean {
    return this.centimos > otro.centimos;
  }

  equals(otro: Monto | null | undefined): boolean {
    return otro instanceof Monto && otro.centimos === this.centimos;
  }

  toString(): string {
    return `S/ ${this.texto}`;
  }
}
