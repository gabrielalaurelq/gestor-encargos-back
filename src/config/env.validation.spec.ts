import { Ambiente, validarEntorno } from './env.validation';

const ENTORNO_VALIDO: Record<string, unknown> = {
  NODE_ENV: 'development',
  PORT: '4000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/gestor_encargos',
  JWT_SECRET: 'un-secreto-de-al-menos-treinta-y-dos-caracteres',
  JWT_ACCESS_EXPIRES_IN: '30m',
  GOOGLE_CLIENT_ID: 'cliente-google',
  FIREBASE_PROJECT_ID: 'proyecto',
  FIREBASE_CLIENT_EMAIL: 'svc@proyecto.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----',
  R2_ACCOUNT_ID: 'cuenta',
  R2_ACCESS_KEY_ID: 'clave',
  R2_SECRET_ACCESS_KEY: 'secreto',
  R2_BUCKET_NAME: 'gestor-encargos-fotos',
};

describe('validarEntorno', () => {
  it('acepta una configuración completa y convierte PORT a número', () => {
    const variables = validarEntorno(ENTORNO_VALIDO);

    expect(variables.NODE_ENV).toBe(Ambiente.development);
    expect(variables.PORT).toBe(4000);
  });

  it('aplica valores por defecto a NODE_ENV, PORT y JWT_ACCESS_EXPIRES_IN', () => {
    const { NODE_ENV, PORT, JWT_ACCESS_EXPIRES_IN, ...sinDefaults } = ENTORNO_VALIDO;
    void NODE_ENV;
    void PORT;
    void JWT_ACCESS_EXPIRES_IN;

    const variables = validarEntorno(sinDefaults);

    expect(variables.NODE_ENV).toBe(Ambiente.development);
    expect(variables.PORT).toBe(3000);
    expect(variables.JWT_ACCESS_EXPIRES_IN).toBe('30m');
  });

  it('falla nombrando la variable requerida que falta', () => {
    const { DATABASE_URL, ...sinBaseDeDatos } = ENTORNO_VALIDO;
    void DATABASE_URL;

    expect(() => validarEntorno(sinBaseDeDatos)).toThrow(/DATABASE_URL/);
  });

  it('rechaza un JWT_SECRET demasiado corto', () => {
    expect(() => validarEntorno({ ...ENTORNO_VALIDO, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
  });

  it('rechaza un NODE_ENV fuera de los tres ambientes del Doc 3', () => {
    expect(() => validarEntorno({ ...ENTORNO_VALIDO, NODE_ENV: 'qa' })).toThrow(/NODE_ENV/);
  });

  describe('valores de plantilla de .env.example', () => {
    const conPlantilla = {
      ...ENTORNO_VALIDO,
      FIREBASE_PRIVATE_KEY: 'reemplazar',
    };

    it('se toleran en development para poder arrancar sin credenciales reales', () => {
      expect(() => validarEntorno(conPlantilla)).not.toThrow();
    });

    it.each(['staging', 'production'])('se rechazan en %s', (ambiente) => {
      expect(() => validarEntorno({ ...conPlantilla, NODE_ENV: ambiente })).toThrow(
        /FIREBASE_PRIVATE_KEY: conserva el valor de plantilla/,
      );
    });
  });
});
