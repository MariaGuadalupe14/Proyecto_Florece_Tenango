# Matriz inicial de riesgos

Escala para probabilidad (P) e impacto (I): 1 = muy bajo, 2 = bajo, 3 = medio, 4 = alto, 5 = muy alto. `R = P x I`. Rangos: 1-4 bajo; 5-9 medio; 10-15 alto; 16-25 cr&iacute;tico. Las puntuaciones son estimaciones iniciales, no mediciones.

| Amenaza / activo | P | I | R | Nivel | Controles observados | Trabajo pendiente |
|---|---:|---:|---:|---|---|---|
| Robo de cuenta por adivinaci&oacute;n o reutilizaci&oacute;n de contrase&ntilde;as | 3 | 4 | 12 | Alto | Argon2id; l&iacute;mite de login; detector de 5 fallos/15 min. | Probar con usuarios sint&eacute;ticos; considerar limitador persistente si hay varias instancias. |
| Inyecci&oacute;n SQL en datos de cuentas y actividad | 2 | 5 | 10 | Alto | Consultas `execute` parametrizadas. | Revisar cualquier consulta nueva; probar rutas contra base aislada y esquema confirmado. |
| XSS en tarjetas y enlaces del cat&aacute;logo | 2 | 4 | 8 | Medio | Escape HTML; enlaces externos limitados a HTTPS; mensajes del asistente usan `textContent`. | Mantener reglas si el cat&aacute;logo llega a ser din&aacute;mico; pruebas de seguridad de interfaz. |
| Robo/abuso de sesi&oacute;n o CSRF | 3 | 5 | 15 | Alto | Regeneraci&oacute;n de sesi&oacute;n al entrar; `HttpOnly`, `SameSite`; `Secure` y HSTS en producci&oacute;n. | No existe guardia CSRF expl&iacute;cita; HTTPS/proxy y navegadores no se probaron. Configurar origen permitido antes de habilitar CORS. |
| Exposici&oacute;n de `.env`, cookies o dependencias en GitHub | 3 | 5 | 15 | Alto | `.env` y cookies ignorados; se a&ntilde;adi&oacute; `node_modules/`; no aparecen rastreados. | Revisar `git status` antes de `git add`; no incluir volcados ni capturas con secretos. |
| P&eacute;rdida o corrupci&oacute;n de MySQL | 3 | 5 | 15 | Alto | Procedimiento 3-2-1 documentado. | No hay evidencia de respaldo ni restauraci&oacute;n; ejecutar simulacro autorizado. |
| Exposici&oacute;n de correo/IP en registros | 3 | 4 | 12 | Alto | Los logs no almacenan contrase&ntilde;as; rutas administrativas requieren rol. | Confirmar permisos de tablas, acceso del administrador y periodo de retenci&oacute;n. |
| Vulnerabilidad en dependencia transitiva | 2 | 4 | 8 | Medio | `npm audit` final en ambos paquetes: 0; `mysql2` corregido a 3.24.6. | Auditar mensualmente y en cada cambio de lockfile. |
| Denegaci&oacute;n de servicio / abuso de endpoints | 2 | 4 | 8 | Medio | JSON limitado a 10 KB; rate limit de login y registro. | No hay l&iacute;mite global; medir carga antes de desplegar p&uacute;blicamente. |
| Retenci&oacute;n excesiva o borrado incorrecto | 2 | 5 | 10 | Alto | Procedimiento de eliminaci&oacute;n redactado. | Acordar plazos, responsables y tratamiento de copias; no hay borrado implementado. |

## Revisi&oacute;n

Actualizar esta matriz al cambiar rutas, roles, alojamiento, esquema, proveedores o tipos de datos. Registrar responsable, fecha y evidencia de cada cambio. No interpretar una puntuaci&oacute;n como garant&iacute;a de seguridad.
