# Evidencias y capturas

## Evidencias locales ya obtenidas

- Pruebas `npm test` en `backend`: 7 aprobadas y 0 fallidas con base simulada.
- `npm audit` de los lockfiles ra&iacute;z y `backend`: 0 vulnerabilidades despu&eacute;s de fijar `mysql2` en 3.24.6.
- `node --check` en JavaScript: sin errores.
- Revisi&oacute;n de `.gitignore`: `backend/.env`, cookies, `node_modules/`, `*.sql` y `*.dump` ignorados.

## Capturas que puede obtener el equipo

1. Terminal con `npm test` mostrando el resumen 7/7. Las pruebas usan datos sint&eacute;ticos.
2. Terminal con `npm audit` ejecutado en ra&iacute;z y luego en `backend`, mostrando cero vulnerabilidades.
3. `npm ls --all mysql2 express-mysql-session`, mostrando que el almac&eacute;n de sesiones resuelve `mysql2` 3.24.6.
4. Editor sobre los atributos de cookie/HSTS, recortando cualquier l&iacute;nea que contenga configuraci&oacute;n privada.
5. Navegador HTTPS en producci&oacute;n mostrando los atributos `HttpOnly`, `Secure` y `SameSite`; ocultar por completo el valor de la cookie.
6. Pruebas en una base aislada: no autenticado = 401, usuario = 403 en ruta admin, administrador autorizado, y seis intentos limitados. Usar cuentas sint&eacute;ticas y no incluir contrase&ntilde;as en la captura.
7. Para Argon2id, mostrar solo un indicador calculado (&quot;formato Argon2id&quot;), nunca el hash completo ni la contrase&ntilde;a.
8. Respaldo y restauraci&oacute;n de prueba mostrando fecha, tama&ntilde;o y base de prueba. No mostrar archivos de opciones, datos personales ni volcado SQL.
9. Detector: evidencia con datos sint&eacute;ticos y una sola alerta dentro de la ventana de supresi&oacute;n.
10. `git check-ignore` para `.env`, cookies y `node_modules`; no abrir ni capturar los archivos ignorados.

## Comprobaciones pendientes

La suite local no conecta a MySQL y no verifica el navegador, certificado/proxy, tablas, permisos reales, copias ni borrado. Esas evidencias requieren configurar el entorno local y una base de pruebas autorizada. No usar la base de producci&oacute;n para generar intentos fallidos ni ensayar restauraciones o eliminaciones.
