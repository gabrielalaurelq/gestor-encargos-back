// class-transformer/class-validator leen los tipos de las propiedades vía
// Reflect.getMetadata; NestJS ya carga reflect-metadata al arrancar, pero
// este módulo también se usa aislado (tests) y debe funcionar por sí solo.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

// Doc 8, Bloque 4: @nestjs/config con validación de esquema al arrancar — la
// app falla rápido si falta una variable requerida, en vez de fallar
// silenciosamente ya en producción. Se usa class-validator (ya es dependencia
// del proyecto por los DTOs, Doc 5 Bloque 3) en lugar de agregar Joi.
// Doc 3, Bloque 4: tres ambientes, cada uno con su propio .env no commiteado.

export enum Ambiente {
  development = 'development',
  staging = 'staging',
  production = 'production',
}

export class VariablesEntorno {
  @IsEnum(Ambiente)
  NODE_ENV: Ambiente = Ambiente.development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Doc 8 Bloque 2: firma de los access token. 32 caracteres es el mínimo
  // razonable para HS256; el valor de plantilla de .env.example lo cumple
  // para que development arranque, pero se rechaza fuera de development.
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN: string = '30m';

  // Doc 3 Bloque 4: "larga duración" para seguir logueado días sin conexión.
  // Decisión Fase 2 Bloque 2: 90 días, configurable; al vencer, un celular
  // perdido pierde acceso por sí solo aunque nadie haya cerrado sesión.
  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN: string = '90d';

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID!: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_PROJECT_ID!: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_CLIENT_EMAIL!: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_PRIVATE_KEY!: string;

  @IsString()
  @IsNotEmpty()
  R2_ACCOUNT_ID!: string;

  @IsString()
  @IsNotEmpty()
  R2_ACCESS_KEY_ID!: string;

  @IsString()
  @IsNotEmpty()
  R2_SECRET_ACCESS_KEY!: string;

  @IsString()
  @IsNotEmpty()
  R2_BUCKET_NAME!: string;
}

// Variables cuyo valor de plantilla ("reemplazar...") no puede llegar a
// staging/producción. En development se tolera para poder levantar la app
// antes de tener credenciales reales de Firebase/R2.
const CLAVES_SIN_PLANTILLA: ReadonlyArray<keyof VariablesEntorno> = [
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
];

const MARCA_PLANTILLA = 'reemplazar';

export function validarEntorno(config: Record<string, unknown>): VariablesEntorno {
  const variables = plainToInstance(VariablesEntorno, config, {
    enableImplicitConversion: true,
  });

  const errores = validateSync(variables, { skipMissingProperties: false });
  const mensajes = errores.map(
    (error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
  );

  if (variables.NODE_ENV !== Ambiente.development) {
    for (const clave of CLAVES_SIN_PLANTILLA) {
      const valor = variables[clave];
      if (typeof valor === 'string' && valor.toLowerCase().includes(MARCA_PLANTILLA)) {
        mensajes.push(`${clave}: conserva el valor de plantilla de .env.example`);
      }
    }
  }

  if (mensajes.length > 0) {
    throw new Error(`Configuración de entorno inválida:\n- ${mensajes.join('\n- ')}`);
  }

  return variables;
}
