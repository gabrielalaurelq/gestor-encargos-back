// Jest fija NODE_ENV=test por defecto, pero `test` no es uno de los tres
// ambientes del Doc 3 (development/staging/production) y la validación de
// entorno lo rechaza — correctamente. Los e2e corren como development: misma
// tolerancia a credenciales de plantilla, Swagger habilitado, base local.
process.env.NODE_ENV = 'development';
