# Procedimiento de respaldos MySQL 3-2-1

**Estado:** procedimiento propuesto; no se ejecut&oacute; ning&uacute;n respaldo ni restauraci&oacute;n.

## Objetivo

Poder recuperar `florece_tenango` ante fallo, error humano o incidente, manteniendo copias protegidas y probando su restauraci&oacute;n.

## Regla 3-2-1

1. Tres copias: base de producci&oacute;n y dos respaldos.
2. Dos medios distintos: por ejemplo, almacenamiento local cifrado y almacenamiento remoto cifrado.
3. Una copia externa al equipo/ubicaci&oacute;n principal, con acceso restringido y MFA.

La copia original no sustituye a dos respaldos. No almacenar respaldos dentro del repositorio, `node_modules` ni en GitHub.

## Antes del primer respaldo

- El responsable de la base confirma el nombre, tablas, ventana y permisos.
- Instalar herramientas `mysqldump` de la misma familia/versi&oacute;n compatible con el servidor.
- Configurar credenciales del cliente en un archivo local protegido por permisos del sistema operativo, fuera del proyecto. No pegar ni capturar su contenido.
- Elegir una carpeta cifrada fuera del repositorio y otra ubicaci&oacute;n externa cifrada.
- Confirmar espacio disponible y definir responsables/retenci&oacute;n.

## Crear copia

En PowerShell, con rutas sustituidas por ubicaciones protegidas del equipo:

```powershell
mysqldump --defaults-extra-file="<archivo-cliente-protegido>" --single-transaction --routines --triggers --events --hex-blob --result-file="<carpeta-protegida>lorece_YYYYMMDD_HHMMSS.sql" florece_tenango
if ($LASTEXITCODE -ne 0) { throw "Fall&oacute; el respaldo" }
```

Comprobar que el archivo exista y tenga tama&ntilde;o mayor a cero. Calcular y registrar un hash SHA-256 del archivo (solo para comprobar integridad; no es cifrado). Cifrarlo antes de trasladarlo a las dos ubicaciones. No copiar credenciales del `.env` al respaldo ni al registro del equipo.

## Restauraci&oacute;n de prueba

- Avisar al responsable y usar una base de prueba vac&iacute;a, separada de producci&oacute;n. Confirmar su nombre antes de restaurar.
- No ejecutar `DROP DATABASE`, sobrescribir producci&oacute;n ni usar comandos de restauraci&oacute;n sobre la base activa.
- Crear/autorizar `florece_tenango_restore_test` con permisos limitados.
- Abrir el cliente `mysql` con el archivo de opciones protegido, seleccionar la base de prueba y cargar el respaldo con `SOURCE <ruta-del-respaldo.sql>;`.
- Validar que las tablas esperadas (`usuarios`, `roles`, `sesiones`, `intentos_acceso`, `registros_actividad`) existan y que la aplicaci&oacute;n pueda consultar datos sint&eacute;ticos.
- Registrar fecha, duraci&oacute;n, resultado, responsable y errores sin capturar credenciales ni datos personales.
- Eliminar la base de prueba solamente con autorizaci&oacute;n expresa y tras revisar el nombre. No se realiz&oacute; esta acci&oacute;n como parte de esta revisi&oacute;n.

## Frecuencia recomendada y retenci&oacute;n

Programar respaldo diario y probar restauraci&oacute;n al menos trimestralmente; ajustar frecuencia y retenci&oacute;n seg&uacute;n cambios y requisitos del equipo. Restringir lectura, cifrar durante transferencia y almacenamiento, controlar caducidad de las copias y documentar fallos. Nunca considerar un respaldo v&aacute;lido hasta comprobar su restauraci&oacute;n.
