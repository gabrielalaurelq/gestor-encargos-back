import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlmacenamientoFotos, UrlFirmada } from '../../application/almacenamiento-fotos';

/**
 * Una hora para subir: la app sube en segundo plano apenas hay conexión
 * (PRD 14). Si no llega a tiempo, reenviar el `POST` con el mismo id da una
 * URL nueva — es la vía de reintento elegida, sin columna de confirmación.
 */
export const VIGENCIA_SUBIDA_S = 60 * 60;

/**
 * Siete días para descargar: el máximo que admite la firma SigV4 (S3 y R2).
 * La app baja la foto y la guarda en local; si la URL venció antes,
 * `GET /encargos/{id}` entrega una recién firmada.
 */
export const VIGENCIA_DESCARGA_S = 7 * 24 * 60 * 60;

/** Las fotos llegan ya comprimidas a JPEG desde la app (Doc 7, PRD 14). */
const TIPO_CONTENIDO = 'image/jpeg';

/** Tope de claves por `DeleteObjects` (límite de la API S3). */
const CLAVES_POR_BORRADO = 1000;

/**
 * R2 expone la API de S3 (Doc 8 Bloque 3), así que se usa el SDK oficial con
 * el endpoint de la cuenta y región `auto`.
 *
 * **Firmar una URL no toca la red**: es un HMAC local. Por eso la app arranca
 * y firma en desarrollo con las credenciales de plantilla; solo `eliminar()`
 * habla con R2. El cliente se crea perezosamente por el mismo motivo que el de
 * Firebase en `auth`: no fallar al arrancar sin credenciales reales.
 */
@Injectable()
export class R2AlmacenamientoFotos extends AlmacenamientoFotos {
  private cliente?: S3Client;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async urlSubida(clave: string): Promise<UrlFirmada> {
    // El `ContentType` queda firmado: la app tiene que mandar ese mismo header,
    // y R2 rechaza un PUT con otro tipo. El presigner **no** lo firma por
    // defecto —lo detectó el spec—, de ahí `signableHeaders`.
    const comando = new PutObjectCommand({
      Bucket: this.bucket,
      Key: clave,
      ContentType: TIPO_CONTENIDO,
    });
    return this.firmar(comando, VIGENCIA_SUBIDA_S, new Set(['content-type']));
  }

  async urlDescarga(clave: string): Promise<UrlFirmada> {
    return this.firmar(
      new GetObjectCommand({ Bucket: this.bucket, Key: clave }),
      VIGENCIA_DESCARGA_S,
    );
  }

  async eliminar(claves: string[]): Promise<void> {
    for (let i = 0; i < claves.length; i += CLAVES_POR_BORRADO) {
      const lote = claves.slice(i, i + CLAVES_POR_BORRADO);
      const respuesta = await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      // S3 informa los fallos por clave dentro de un 200; ignorarlos dejaría
      // borrar las filas con los archivos todavía en el bucket.
      if (respuesta.Errors?.length) {
        const primero = respuesta.Errors[0];
        throw new Error(
          `R2 no borró ${respuesta.Errors.length} archivo(s); p. ej. ${primero.Key}: ${primero.Code}`,
        );
      }
    }
  }

  private async firmar(
    comando: PutObjectCommand | GetObjectCommand,
    segundos: number,
    signableHeaders?: Set<string>,
  ): Promise<UrlFirmada> {
    const expiraEn = new Date(Date.now() + segundos * 1000);
    const url = await getSignedUrl(this.s3, comando, { expiresIn: segundos, signableHeaders });
    return { url, expiraEn };
  }

  private get bucket(): string {
    return this.config.getOrThrow<string>('R2_BUCKET_NAME');
  }

  private get s3(): S3Client {
    this.cliente ??= new S3Client({
      region: 'auto',
      // Estilo ruta (`host/bucket/clave`) y no subdominio (`bucket.host/clave`):
      // es el que documenta R2 y no rompe el certificado TLS si el nombre del
      // bucket lleva puntos. Lo detectó el spec de la firma.
      forcePathStyle: true,
      endpoint: `https://${this.config.getOrThrow<string>('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
    return this.cliente;
  }
}
