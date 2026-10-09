/**
 * El token FCM ya lo tiene un dispositivo de **otro** negocio.
 *
 * Pasa si el usuario anterior de ese teléfono nunca cerró sesión: su fila
 * sigue reclamando el token y RLS impide verla o limpiarla desde acá — el rol
 * de la aplicación no es superusuario, por diseño (Doc 4, Bloque 4). Dentro
 * del propio negocio el caso sí se resuelve solo, limpiando la fila anterior.
 *
 * La salida es que esa sesión antigua haga `/auth/logout`, que borra su fila
 * entera. No se puede hacer nada mejor sin renunciar a la unicidad del token
 * —que evitaría que dos negocios reciban las notificaciones del mismo
 * teléfono— ni a RLS.
 */
export class FcmTokenEnUsoError extends Error {
  constructor() {
    super('El token de notificaciones ya está registrado por otro dispositivo.');
    this.name = 'FcmTokenEnUsoError';
  }
}
