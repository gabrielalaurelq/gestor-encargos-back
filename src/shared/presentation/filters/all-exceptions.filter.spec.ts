import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ErrorAutenticacion } from '../../application/error-autenticacion';
import { DomainError } from '../../domain/domain-error';
import { traducirExcepcion } from './all-exceptions.filter';

class DescuentoInvalidoError extends DomainError {
  readonly codigo = 'DESCUENTO_INVALIDO';

  constructor(descuentoSolicitado: number, sumaTrabajos: number) {
    super('El descuento no puede ser mayor a la suma de los trabajos.', {
      descuento_solicitado: descuentoSolicitado,
      suma_trabajos: sumaTrabajos,
    });
  }
}

describe('traducirExcepcion', () => {
  it('mapea un DomainError a 422 con el código del catálogo del Doc 5', () => {
    const resultado = traducirExcepcion(new DescuentoInvalidoError(25, 20));

    expect(resultado.status).toBe(422);
    expect(resultado.cuerpo).toEqual({
      error: {
        codigo: 'DESCUENTO_INVALIDO',
        mensaje: 'El descuento no puede ser mayor a la suma de los trabajos.',
        detalles: { descuento_solicitado: 25, suma_trabajos: 20 },
      },
    });
  });

  it('mapea un ErrorAutenticacion a 401 con su código propio', () => {
    const resultado = traducirExcepcion(
      new ErrorAutenticacion('TOKEN_EXPIRADO', 'El access token expiró.'),
    );

    expect(resultado.status).toBe(401);
    expect(resultado.cuerpo).toEqual({
      error: { codigo: 'TOKEN_EXPIRADO', mensaje: 'El access token expiró.' },
    });
  });

  it('mapea los errores de class-validator a 400 con la lista en detalles.errores', () => {
    const excepcion = new BadRequestException([
      'nombre should not be empty',
      'telefono must be a string',
    ]);

    const resultado = traducirExcepcion(excepcion);

    expect(resultado.status).toBe(400);
    expect(resultado.cuerpo.error.codigo).toBe('SOLICITUD_INVALIDA');
    expect(resultado.cuerpo.error.detalles).toEqual({
      errores: ['nombre should not be empty', 'telefono must be a string'],
    });
  });

  it('mapea NotFoundException a 404 NO_ENCONTRADO conservando el mensaje', () => {
    const resultado = traducirExcepcion(new NotFoundException('Encargo no encontrado'));

    expect(resultado.status).toBe(404);
    expect(resultado.cuerpo.error).toEqual({
      codigo: 'NO_ENCONTRADO',
      mensaje: 'Encargo no encontrado',
    });
  });

  it('respeta un código propio cuando la excepción HTTP lo trae en su respuesta', () => {
    const excepcion = new UnauthorizedException({
      codigo: 'TOKEN_EXPIRADO',
      mensaje: 'El access token expiró.',
    });

    const resultado = traducirExcepcion(excepcion);

    expect(resultado.status).toBe(401);
    expect(resultado.cuerpo.error).toEqual({
      codigo: 'TOKEN_EXPIRADO',
      mensaje: 'El access token expiró.',
    });
  });

  it('usa NO_AUTENTICADO por defecto para un 401 sin código propio', () => {
    const resultado = traducirExcepcion(new UnauthorizedException());

    expect(resultado.status).toBe(401);
    expect(resultado.cuerpo.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('convierte cualquier error desconocido en 500 sin filtrar el detalle interno', () => {
    const resultado = traducirExcepcion(new Error('password de la base: hunter2'));

    expect(resultado.status).toBe(500);
    expect(resultado.cuerpo).toEqual({
      error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' },
    });
    expect(JSON.stringify(resultado.cuerpo)).not.toContain('hunter2');
  });

  it('también cubre valores lanzados que no son Error', () => {
    const resultado = traducirExcepcion('algo raro');

    expect(resultado.status).toBe(500);
    expect(resultado.cuerpo.error.codigo).toBe('ERROR_INTERNO');
  });
});
