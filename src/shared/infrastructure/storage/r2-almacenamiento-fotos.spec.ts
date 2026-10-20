import { ConfigService } from '@nestjs/config';
import {
  R2AlmacenamientoFotos,
  VIGENCIA_DESCARGA_S,
  VIGENCIA_SUBIDA_S,
} from './r2-almacenamiento-fotos';

// Firmar es un HMAC local: estas pruebas no tocan la red ni necesitan
// credenciales reales, solo comprueban qué queda firmado en la URL.
describe('R2AlmacenamientoFotos (firma)', () => {
  const config = new ConfigService({
    R2_ACCOUNT_ID: 'cuenta123',
    R2_ACCESS_KEY_ID: 'clave-acceso',
    R2_SECRET_ACCESS_KEY: 'secreto',
    R2_BUCKET_NAME: 'fotos-test',
  });
  const almacenamiento = new R2AlmacenamientoFotos(config);
  const CLAVE = 'negocios/n1/encargos/e1/fotos/f1.jpg';

  it('URL de subida: endpoint de la cuenta, bucket y clave, vigencia de 1 hora', async () => {
    const { url, expiraEn } = await almacenamiento.urlSubida(CLAVE);
    const parsed = new URL(url);

    expect(parsed.host).toBe('cuenta123.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe(`/fotos-test/${CLAVE}`);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe(String(VIGENCIA_SUBIDA_S));
    // El tipo de contenido va entre los headers firmados: R2 rechaza otro.
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(expiraEn.getTime() - Date.now()).toBeGreaterThan((VIGENCIA_SUBIDA_S - 5) * 1000);
  });

  it('URL de descarga: 7 días, el máximo de SigV4', async () => {
    const { url } = await almacenamiento.urlDescarga(CLAVE);

    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe(String(VIGENCIA_DESCARGA_S));
    expect(VIGENCIA_DESCARGA_S).toBe(604800);
  });
});
