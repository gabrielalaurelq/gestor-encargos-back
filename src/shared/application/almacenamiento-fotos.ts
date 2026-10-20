export interface UrlFirmada {
  url: string;
  expiraEn: Date;
}

/**
 * Puerto del almacenamiento de fotos (Doc 3 ADR-007: Cloudflare R2, nunca en
 * PostgreSQL ni en el servidor). Vive en `shared/` porque lo usan tres
 * módulos: `encargos` (alta y detalle), `sync` (URLs de descarga) y
 * `mantenimiento` (borrar los archivos al purgar).
 *
 * **El binario nunca pasa por el backend** (Doc 8 Bloque 3): la app sube con
 * un `PUT` directo a la URL firmada y descarga con un `GET` directo. El bucket
 * es **privado** (decisión del usuario, frente al bucket público que sugería
 * el ADR-007): sin una URL firmada vigente nadie abre una foto.
 *
 * Trabaja con **claves** (`negocios/{n}/encargos/{e}/fotos/{f}.jpg`), no con
 * URLs: una URL firmada caduca, la clave no.
 */
export abstract class AlmacenamientoFotos {
  /** URL de `PUT` para subir el archivo de esa clave. */
  abstract urlSubida(clave: string): Promise<UrlFirmada>;

  /** URL de `GET` para descargarlo. */
  abstract urlDescarga(clave: string): Promise<UrlFirmada>;

  /** Borra los archivos. Idempotente: una clave que ya no existe no es error. */
  abstract eliminar(claves: string[]): Promise<void>;
}

/** Nomenclatura de objetos del Doc 8 Bloque 3, organizada por negocio. */
export function claveFoto(negocioId: string, encargoId: string, fotoId: string): string {
  return `negocios/${negocioId}/encargos/${encargoId}/fotos/${fotoId}.jpg`;
}
