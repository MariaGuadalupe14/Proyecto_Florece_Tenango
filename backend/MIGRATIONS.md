# Migraciones de contenido

## Archivos

- `migration-001-content-preflight.sql`: solo lectura. Detecta si los objetos están ausentes, completos o parcialmente creados.
- `migration-001-content-up.sql`: instalación para esquema limpio. **No es seguro volver a ejecutarlo** si ya existe algún objeto que agrega.
- `migration-001-content-DESTRUCTIVE-rollback.sql`: plantilla de reversión destructiva. Sus sentencias están comentadas y no se ejecutan. Si se descomentan, borran las tablas de videos y galería, además de las columnas nuevas de `negocios`; también se perdería contenido creado desde el panel.

La migración conserva las filas existentes en `negocios` y no modifica `usuarios`, `roles`, `sesiones`, `intentos_acceso` ni `registros_actividad`. Los negocios existentes reciben estado `borrador`; se insertan como publicados los dos videos y las 53 imágenes actuales. Los índices `UNIQUE` hacen que una URL de video y una ruta de imagen no puedan repetirse.

## Procedimiento seguro

1. **No conectes el backend durante la migración.** Detén temporalmente el servidor para que ninguna ruta CRUD consulte tablas mientras se actualiza el esquema.
2. **Respalda la base completa** `florece_tenango` desde MySQL Workbench: `Server > Data Export`, selecciona la base y exporta el esquema y los datos a un archivo SQL. Comprueba que el archivo de respaldo exista.
3. **Selecciona la base correcta** en Workbench y abre `migration-001-content-preflight.sql`. Ejecútalo primero. Es de solo lectura. Confirma que `base_seleccionada` sea `florece_tenango` y revisa todos los estados devueltos.
4. Clasifica el resultado:
   - **Limpio:** `negocios` existe, sus cinco columnas nuevas y su índice están ausentes, y `videos` y `galeria_imagenes` no existen. Puedes continuar al paso 5.
   - **Completo:** todos los objetos, columnas e índices están presentes y sus tipos coinciden con `migration-001-content-up.sql`. No ejecutes UP otra vez; pasa al paso 7.
   - **Parcial o distinto:** hay una mezcla de presentes y faltantes, un objeto tiene tipo diferente, o la base seleccionada no es la correcta. **Detente. No ejecutes UP ni el rollback.** Usa la salida de columnas del preflight y revisa `SHOW CREATE TABLE negocios`, `SHOW CREATE TABLE videos` y `SHOW CREATE TABLE galeria_imagenes` para preparar una reparación que solo agregue lo faltante. Si alguna tabla aún no existe, omite su `SHOW CREATE TABLE`. No borres registros para volver a un estado limpio.
5. En estado limpio, revisa `migration-001-content-up.sql` y ejecútalo **una sola vez** con `florece_tenango` seleccionada. No selecciones ni ejecutes el rollback.
6. Si Workbench muestra un error, detente. MySQL puede confirmar cada sentencia DDL por separado, así que el esquema puede quedar parcial. Vuelve a ejecutar solo el preflight y sigue la rama “Parcial”; no vuelvas a lanzar el UP completo.
7. Verifica esquema y contenido:

   ```sql
   SELECT estado, COUNT(*) FROM videos GROUP BY estado;
   SELECT estado, COUNT(*) FROM galeria_imagenes GROUP BY estado;
   SELECT COUNT(*) AS videos_drive FROM videos
   WHERE video_url IN (
     'https://drive.google.com/file/d/1XZAYz-KkDAl047EO_GFwjSe_ycTkAh3U/preview',
     'https://drive.google.com/file/d/1fqybrwQCK0_6EPYu62fSdxX13I1jUea_/preview'
   );
   SELECT COUNT(*) AS fotos_semilla FROM galeria_imagenes
   WHERE imagen_url REGEXP '^Fotos_Tenango/Galeria/tenango-[0-9]{2}\\.webp$';
   ```

   Debe haber 2 videos Drive y 53 fotos semilla. También confirma las restricciones `uq_videos_video_url` y `uq_galeria_imagen_url` en los índices.
8. Solo después de verificar la migración, inicia el backend y prueba las consultas públicas y el panel administrador. Las imágenes siguen en los archivos estáticos; los videos siguen alojados en Drive.

## Duplicados y restricciones UNIQUE

La nueva tabla de galería no debe contener varias filas para una misma ruta de archivo; la restricción `UNIQUE (imagen_url)` evita duplicados durante la semilla y futuras altas. Antes de añadir esa restricción manualmente a una tabla creada en un intento parcial, comprueba duplicados:

```sql
SELECT imagen_url, COUNT(*) AS repeticiones
FROM galeria_imagenes
GROUP BY imagen_url
HAVING COUNT(*) > 1;

SELECT video_url, COUNT(*) AS repeticiones
FROM videos
GROUP BY video_url
HAVING COUNT(*) > 1;
```

Si cualquiera devuelve filas, no agregues el índice hasta resolverlas conservando el contenido que necesites. La comparación de URLs se hace con collation binaria para distinguir rutas que solo difieren en mayúsculas y minúsculas. Confirma también que la versión y configuración de InnoDB admitan el índice completo de 500 caracteres antes de ejecutar.

La semilla usa `NOT EXISTS` junto con esas restricciones únicas: repetir solo las inserciones no crea una segunda fila para la misma URL/ruta. Una colisión simultánea se detiene por la restricción y no crea duplicados. El DDL de instalación, en cambio, no es repetible; el preflight es obligatorio antes de cada intento.

**No uses el rollback para corregir un fallo parcial.** Las sentencias destructivas permanecen comentadas. Incluso con respaldo, solo deben descomentarse de forma deliberada si se decidió perder todo el contenido de estos módulos y las columnas añadidas a `negocios`.
