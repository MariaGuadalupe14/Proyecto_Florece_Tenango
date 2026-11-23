# Bit&aacute;cora de mantenimiento y actualizaciones

| Fecha | &Aacute;rea | Cambio / motivo | Verificaci&oacute;n | Estado / responsable |
|---|---|---|---|---|
| 2026-11-23 | Revisi&oacute;n inicial | Inventario de backend, rutas, sesiones, dependencias y configuraci&oacute;n Git; sin leer `backend/.env`. | `node --check`; inspecci&oacute;n est&aacute;tica. | Revisado por Codex; esquema MySQL pendiente. |
| 2026-11-23 | Dependencias | `mysql2` actualizado/forzado a 3.24.6 por avisos de npm; dependencias declaradas en `backend/package.json`. | `npm audit` ra&iacute;z y backend: 0 vulnerabilidades; `npm test`: 7/7. | Revisar lockfiles en cada instalaci&oacute;n. |
| 2026-11-23 | Sesi&oacute;n y conexi&oacute;n | Cookie `Secure` y HSTS en producci&oacute;n; TLS configurable y compartido entre pool de datos y sesiones; ruta de `.env` fija. | Sintaxis JavaScript; configuraci&oacute;n no probada contra proxy/MySQL real. | Falta configurar valores localmente y verificar despliegue. |
| 2026-11-23 | Acceso y alertas | L&iacute;mite al registro; validaci&oacute;n de email; alerta duplicada suprimida por 15 min en el proceso. | Pruebas simuladas de HTTP y detector. | Persistencia multi-instancia pendiente. |
| 2026-11-23 | Documentaci&oacute;n | Procedimientos 3-2-1, eliminaci&oacute;n, riesgos y evidencias. | Revisi&oacute;n documental. | El equipo debe asignar responsables y aprobar retenciones. |

## Rutina recomendada

- En cada cambio de dependencia: revisar changelog, actualizar de forma compatible, ejecutar `npm test` desde `backend` y `npm audit` tanto en ra&iacute;z como en `backend`.
- Mensualmente y antes de publicar: revisar estado de dependencias, `.gitignore`, configuraci&oacute;n HTTPS, registros y permisos.
- Trimestralmente: ejecutar restauraci&oacute;n de prueba autorizada y guardar evidencia redactada.
- En cada despliegue: revisar certificado TLS, cookies, `TRUST_PROXY_HOPS`, `DB_SSL`, respaldos y alertas.
- Registrar fecha, archivos, motivo, comando, resultado y responsable. No incluir `.env`, cookies, hashes reales, datos de usuarios ni volcados SQL.
