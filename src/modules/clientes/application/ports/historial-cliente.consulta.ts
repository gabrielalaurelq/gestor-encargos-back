import { Monto } from '../../../../shared/domain/monto';

/**
 * Resumen de Historial (PRD módulo 18): "N encargos · S/X total · Última
 * visita: [fecha]". Son tres números y nada más, por diseño del PRD.
 */
export interface HistorialCliente {
  /** Activos + entregados + cancelados: todos los encargos del cliente. */
  totalEncargos: number;
  /**
   * Dinero efectivamente pagado: suma de pagos no eliminados, **incluidos**
   * los de encargos cancelados (PRD 18, casos extremos — el dinero ingresó,
   * igual que en Caja diaria).
   */
  totalPagado: Monto;
  /** `creado_en` del encargo más reciente; `null` si no tiene ninguno. */
  ultimoEncargoEn: Date | null;
}

/**
 * Puerto de lectura cross-agregado (Cliente + Encargos + Pagos). Es una
 * consulta y no parte de `ClienteRepository` a propósito: no reconstituye el
 * agregado ni sostiene invariantes, solo proyecta — el mismo criterio que el
 * módulo `sync`. Vive en `clientes` y no en `encargos` porque es la ficha del
 * cliente la que lo muestra, y porque `EncargosModule` ya importa
 * `ClientesModule`: la dependencia inversa sería circular.
 */
export abstract class HistorialClienteConsulta {
  abstract obtener(clienteId: string): Promise<HistorialCliente>;
}
