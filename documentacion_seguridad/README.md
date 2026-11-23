# Documentaci&oacute;n de seguridad - Florece Tenango

**Revisi&oacute;n inicial:** 23 de noviembre de 2026.

Estos documentos describen controles observados o agregados al c&oacute;digo y separan lo pendiente de comprobar. Las estimaciones de riesgo son iniciales, no provienen de telemetr&iacute;a de producci&oacute;n.

## Archivos

- `estado_11_temas.md`: estado de cada tema, comprobaci&oacute;n y l&iacute;mites de la evidencia.
- `matriz_riesgos.md`: amenazas, probabilidad, impacto y controles.
- `procedimiento_respaldos_3-2-1.md`: generaci&oacute;n, protecci&oacute;n y restauraci&oacute;n de copias.
- `procedimiento_eliminacion_segura.md`: flujo de revisi&oacute;n y eliminaci&oacute;n autorizada.
- `bitacora_mantenimiento.md`: cambios, motivo y verificaci&oacute;n.
- `evidencias.md`: capturas y comprobaciones que puede presentar el equipo.

## Alcance de la revisi&oacute;n

Se revis&oacute; el c&oacute;digo y se ejecutaron pruebas HTTP con una base de datos simulada. No se ley&oacute; `backend/.env`, no se mostraron credenciales, no se conect&oacute; a MySQL, no se hicieron respaldos y no se borraron ni alteraron datos. Las pruebas simuladas no sustituyen una prueba de integraci&oacute;n con una base real.

El repositorio no contiene un esquema SQL ni migraciones. Antes de probar autenticaci&oacute;n real, el equipo debe confirmar el esquema existente y disponer de una base de pruebas aislada.

## Configuraci&oacute;n local

`backend/.env.example` es una plantilla sin credenciales. Copiarla a `backend/.env`, completar los valores solo en el equipo local y generar localmente un `SESSION_SECRET` aleatorio de al menos 32 bytes. No compartir `.env`, cookies, contrase&ntilde;as, tokens ni capturas con esos valores. `.gitignore` excluye esos archivos y `node_modules`.

Para producci&oacute;n, habilitar `NODE_ENV=production`, configurar HTTPS en un proxy conocido, establecer `TRUST_PROXY_HOPS` con el n&uacute;mero real de saltos y usar `DB_SSL=true` con una CA verificada cuando corresponda. La plantilla mantiene TLS desactivado para desarrollo local.
