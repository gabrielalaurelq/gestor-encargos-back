import { ConflictException } from '@nestjs/common';
import { RecursoDuplicadoError } from '../domain/recurso-duplicado.error';
import { crearIdempotente } from './crear-idempotente';

const ID = '11111111-2222-3333-4444-555555555555';

describe('crearIdempotente', () => {
  let buscar: jest.Mock;
  let crear: jest.Mock;

  beforeEach(() => {
    buscar = jest.fn();
    crear = jest.fn();
  });

  it('sin id: no consulta antes, crea y marca creado=true (201)', async () => {
    crear.mockResolvedValue({ id: 'generado' });

    const resultado = await crearIdempotente({ buscar, crear });

    expect(buscar).not.toHaveBeenCalled();
    expect(resultado).toEqual({ recurso: { id: 'generado' }, creado: true });
  });

  it('con id nuevo: comprueba, no encuentra y crea', async () => {
    buscar.mockResolvedValue(null);
    crear.mockResolvedValue({ id: ID });

    const resultado = await crearIdempotente({ id: ID, buscar, crear });

    expect(resultado.creado).toBe(true);
    expect(crear).toHaveBeenCalledTimes(1);
  });

  it('con id existente: devuelve el existente sin escribir (200, reintento del Outbox)', async () => {
    buscar.mockResolvedValue({ id: ID, nombre: 'Original' });

    const resultado = await crearIdempotente({ id: ID, buscar, crear });

    expect(crear).not.toHaveBeenCalled();
    expect(resultado).toEqual({ recurso: { id: ID, nombre: 'Original' }, creado: false });
  });

  it('carrera entre dos reintentos: el que pierde relee y devuelve lo del otro', async () => {
    buscar
      .mockResolvedValueOnce(null) // comprobación previa: todavía no existe
      .mockResolvedValueOnce({ id: ID, nombre: 'Del otro' }); // relectura tras el choque
    crear.mockRejectedValue(new RecursoDuplicadoError('cliente', ID));

    const resultado = await crearIdempotente({ id: ID, buscar, crear });

    expect(resultado).toEqual({ recurso: { id: ID, nombre: 'Del otro' }, creado: false });
  });

  it('id ya usado por otro negocio: 409 neutro, no 500 ni filtración', async () => {
    // Choca con la llave primaria (global) pero la fila no es visible para
    // esta sesión: pertenece a otro negocio.
    buscar.mockResolvedValue(null);
    crear.mockRejectedValue(new RecursoDuplicadoError('cliente', ID));

    const promesa = crearIdempotente({ id: ID, buscar, crear });

    await expect(promesa).rejects.toThrow(ConflictException);
    await expect(promesa).rejects.toThrow('El id enviado ya está en uso.');
  });

  it('propaga cualquier otro error', async () => {
    crear.mockRejectedValue(new Error('conexión caída'));

    await expect(crearIdempotente({ buscar, crear })).rejects.toThrow('conexión caída');
  });
});
