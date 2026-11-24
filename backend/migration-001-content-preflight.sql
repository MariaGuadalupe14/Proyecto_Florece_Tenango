-- PREFLIGHT DE SOLO LECTURA para migration-001-content-up.sql.
-- Contiene únicamente SELECT y SHOW VARIABLES: no crea ni modifica objetos,
-- datos, variables de sesión ni archivos.
-- Selecciona florece_tenango en Workbench. Si el resultado de base de datos
-- no es EXACTAMENTE florece_tenango, DETENTE y no ejecutes migration UP.

-- 1) Base seleccionada y versión. El estado debe ser BASE_OK.
SELECT
    DATABASE() AS base_seleccionada,
    VERSION() AS version_mysql,
    CASE
        WHEN DATABASE() IS NULL THEN 'ERROR: no hay una base seleccionada; NO CONTINUAR.'
        WHEN BINARY DATABASE() <> BINARY 'florece_tenango' THEN 'ERROR: la base no es exactamente florece_tenango; NO CONTINUAR.'
        ELSE 'BASE_OK: florece_tenango seleccionada.'
    END AS resultado_base;

-- 2) Requisito de índice: VARCHAR(500) con utf8mb4 puede ocupar 2000 bytes.
-- InnoDB admite hasta 3072 bytes con DYNAMIC/COMPRESSED y página de 16 KB,
-- pero COMPACT/REDUNDANT tiene límite de 767 bytes; páginas de 8/4 KB reducen
-- el máximo. Este resultado es una ADVERTENCIA: confirma versión y variables.
SELECT
    VERSION() AS version_mysql,
    'ADVERTENCIA: los UNIQUE sobre VARCHAR(500) utf8mb4 requieren hasta 2000 bytes por clave. Verifica page_size y row_format; si el límite aplicable es menor, NO ejecutes UP sin ajustar y revisar el diseño.' AS advertencia_indices;
SELECT VERSION() AS version_mysql,
       CASE
           WHEN VERSION() REGEXP '^5\\.[0-6]\\.' OR VERSION() REGEXP '^5\\.7\\.[0-6]([.-]|$)'
               THEN 'RIESGO: esta versión podría requerir configuración InnoDB explícita para admitir claves mayores de 767 bytes.'
           ELSE 'VERIFICAR CONFIGURACIÓN: la versión por sí sola no confirma el límite; revisar page_size, row_format y variables que aparezcan abajo.'
       END AS aviso_version;
SHOW VARIABLES LIKE 'innodb_page_size';
SHOW VARIABLES LIKE 'innodb_default_row_format';
SHOW VARIABLES LIKE 'innodb_large_prefix';
SHOW VARIABLES LIKE 'innodb_file_format';

-- 3) Comprueba la tabla base y las columnas que UP utiliza como anclas.
SELECT
    CASE
        WHEN DATABASE() IS NULL OR BINARY DATABASE() <> BINARY 'florece_tenango' THEN 'ERROR_DATABASE: no continuar.'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios') THEN 'ERROR_BASE_SCHEMA: falta negocios; no continuar.'
        WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios'
              AND COLUMN_NAME IN ('id','nombre','categoria','descripcion','contacto','fecha_creacion')) = 6 THEN 'BASE_SCHEMA_OK: negocios y columnas ancla presentes.'
        ELSE 'ERROR_BASE_SCHEMA: faltan columnas ancla de negocios; no continuar.'
    END AS resultado_esquema_base;

-- 4) Comparación de cada columna añadida por UP. Una columna solo figura como
-- CORRECTA si coinciden tipo, longitud, nulabilidad, valor predeterminado,
-- atributo EXTRA y, cuando UP los fija explícitamente, charset/collation.
SELECT
    e.TABLE_NAME,
    e.COLUMN_NAME,
    CASE
        WHEN c.COLUMN_NAME IS NULL THEN 'FALTA'
        WHEN LOWER(c.DATA_TYPE) <> e.DATA_TYPE
          OR LOWER(c.COLUMN_TYPE) <> e.COLUMN_TYPE
          OR (e.CHARACTER_MAXIMUM_LENGTH IS NOT NULL AND NOT (c.CHARACTER_MAXIMUM_LENGTH <=> e.CHARACTER_MAXIMUM_LENGTH))
          OR (e.CHARACTER_SET_NAME IS NOT NULL AND NOT (c.CHARACTER_SET_NAME <=> e.CHARACTER_SET_NAME))
          OR (e.COLLATION_NAME IS NOT NULL AND NOT (c.COLLATION_NAME <=> e.COLLATION_NAME)) THEN 'TIPO/LONGITUD/CHARSET INCORRECTO'
        WHEN c.IS_NULLABLE <> e.IS_NULLABLE THEN 'NULABILIDAD INCORRECTA'
        WHEN e.DEFAULT_KIND = 'CURRENT_TIMESTAMP'
             AND LOWER(REPLACE(COALESCE(c.COLUMN_DEFAULT, ''), '()', '')) <> 'current_timestamp' THEN 'DEFAULT INCORRECTO'
        WHEN e.DEFAULT_KIND = 'LITERAL' AND NOT (CAST(c.COLUMN_DEFAULT AS CHAR) <=> e.DEFAULT_VALUE) THEN 'DEFAULT INCORRECTO'
        WHEN e.DEFAULT_KIND = 'NULL' AND c.COLUMN_DEFAULT IS NOT NULL THEN 'DEFAULT INCORRECTO'
        WHEN e.EXTRA_KIND = 'AUTO_INCREMENT' AND LOWER(c.EXTRA) NOT LIKE '%auto_increment%' THEN 'EXTRA INCORRECTO'
        WHEN e.EXTRA_KIND = 'ON_UPDATE' AND LOWER(c.EXTRA) NOT LIKE '%on update current_timestamp%' THEN 'EXTRA INCORRECTO'
        WHEN e.EXTRA_KIND = 'NONE' AND LOWER(COALESCE(c.EXTRA, '')) LIKE '%auto_increment%' THEN 'EXTRA INCORRECTO'
        ELSE 'CORRECTA'
    END AS comparacion
FROM (
    SELECT 'negocios' AS TABLE_NAME, 'ubicacion' AS COLUMN_NAME, 'varchar' AS DATA_TYPE, 'varchar(255)' AS COLUMN_TYPE, 255 AS CHARACTER_MAXIMUM_LENGTH, 'YES' AS IS_NULLABLE, 'NULL' AS DEFAULT_KIND, CAST(NULL AS CHAR(100)) AS DEFAULT_VALUE, 'NONE' AS EXTRA_KIND, NULL AS CHARACTER_SET_NAME, NULL AS COLLATION_NAME
    UNION ALL SELECT 'negocios','sitio_web','varchar','varchar(500)',500,'YES','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'negocios','imagen_url','varchar','varchar(500)',500,'YES','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'negocios','estado','enum','enum(''borrador'',''publicado'',''archivado'')',NULL,'NO','LITERAL','borrador','NONE',NULL,NULL
    UNION ALL SELECT 'negocios','fecha_actualizacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'ON_UPDATE',NULL,NULL
    UNION ALL SELECT 'videos','id','int','int',NULL,'NO','NULL',NULL,'AUTO_INCREMENT',NULL,NULL
    UNION ALL SELECT 'videos','titulo','varchar','varchar(150)',150,'NO','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'videos','descripcion','text','text',NULL,'YES','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'videos','video_url','varchar','varchar(500)',500,'NO','NULL',NULL,'NONE','utf8mb4','utf8mb4_bin'
    UNION ALL SELECT 'videos','miniatura_url','varchar','varchar(500)',500,'YES','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'videos','estado','enum','enum(''borrador'',''publicado'',''archivado'')',NULL,'NO','LITERAL','borrador','NONE',NULL,NULL
    UNION ALL SELECT 'videos','fecha_creacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'videos','fecha_actualizacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'ON_UPDATE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','id','int','int',NULL,'NO','NULL',NULL,'AUTO_INCREMENT',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','titulo','varchar','varchar(150)',150,'NO','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','descripcion','text','text',NULL,'YES','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','imagen_url','varchar','varchar(500)',500,'NO','NULL',NULL,'NONE','utf8mb4','utf8mb4_bin'
    UNION ALL SELECT 'galeria_imagenes','texto_alternativo','varchar','varchar(255)',255,'NO','NULL',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','orden','int','int unsigned',NULL,'NO','LITERAL','0','NONE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','estado','enum','enum(''borrador'',''publicado'',''archivado'')',NULL,'NO','LITERAL','borrador','NONE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','fecha_creacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'NONE',NULL,NULL
    UNION ALL SELECT 'galeria_imagenes','fecha_actualizacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'ON_UPDATE',NULL,NULL
) AS e
LEFT JOIN information_schema.COLUMNS AS c
  ON c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = e.TABLE_NAME AND c.COLUMN_NAME = e.COLUMN_NAME
ORDER BY e.TABLE_NAME, e.COLUMN_NAME;

-- 5) Comprueba motor y collation requeridos por CREATE TABLE en UP.
SELECT
    e.TABLE_NAME,
    CASE
        WHEN t.TABLE_NAME IS NULL THEN 'FALTA'
        WHEN UPPER(t.ENGINE) = 'INNODB' AND LOWER(t.TABLE_COLLATION) = 'utf8mb4_unicode_ci' THEN 'CORRECTA'
        ELSE 'ENGINE/COLLATION INCORRECTOS'
    END AS comparacion,
    t.ENGINE,
    t.TABLE_COLLATION,
    t.ROW_FORMAT
FROM (
    SELECT 'videos' AS TABLE_NAME
    UNION ALL SELECT 'galeria_imagenes'
) AS e
LEFT JOIN information_schema.TABLES AS t
  ON t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = e.TABLE_NAME
ORDER BY e.TABLE_NAME;

-- 6) Comprueba índices exactos, columnas y orden. No cuenta un UNIQUE parcial
-- ni uno compuesto como sustituto de la restricción de una sola columna.
SELECT 'negocios' AS TABLE_NAME, 'idx_negocios_estado_categoria' AS INDEX_NAME,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.STATISTICS s
           WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'negocios'
             AND s.INDEX_NAME = 'idx_negocios_estado_categoria' AND s.NON_UNIQUE = 1
             AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'estado' AND s.SUB_PART IS NULL
             AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 2
             AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s2 WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = 'categoria' AND s2.SUB_PART IS NULL)
       ) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END AS comparacion
UNION ALL
SELECT 'videos', 'PRIMARY(id)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'videos' AND s.INDEX_NAME = 'PRIMARY' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'id' AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END
UNION ALL
SELECT 'videos', 'uq_videos_video_url(video_url)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'videos' AND s.INDEX_NAME = 'uq_videos_video_url' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'video_url' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END
UNION ALL
SELECT 'videos', 'idx_videos_estado_fecha(estado,fecha_creacion)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'videos' AND s.INDEX_NAME = 'idx_videos_estado_fecha' AND s.NON_UNIQUE = 1 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'estado' AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 2 AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s2 WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = 'fecha_creacion')) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END
UNION ALL
SELECT 'galeria_imagenes', 'PRIMARY(id)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'galeria_imagenes' AND s.INDEX_NAME = 'PRIMARY' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'id' AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END
UNION ALL
SELECT 'galeria_imagenes', 'uq_galeria_imagen_url(imagen_url)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'galeria_imagenes' AND s.INDEX_NAME = 'uq_galeria_imagen_url' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'imagen_url' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END
UNION ALL
SELECT 'galeria_imagenes', 'idx_galeria_estado_orden(estado,orden)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'galeria_imagenes' AND s.INDEX_NAME = 'idx_galeria_estado_orden' AND s.NON_UNIQUE = 1 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'estado' AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 2 AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s2 WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = 'orden')) THEN 'CORRECTO' ELSE 'FALTA/INCORRECTO' END;

-- 7) Clasificación global. COMPLETE exige base correcta, todas las columnas
-- coincidentes, tablas InnoDB/utf8mb4_unicode_ci e índices exactos.
-- CLEAN significa que negocios existe y ninguno de los objetos añadidos por UP
-- está presente. Cualquier mezcla o definición distinta es PARTIAL.
SELECT
    CASE
        WHEN DATABASE() IS NULL OR BINARY DATABASE() <> BINARY 'florece_tenango' THEN 'ERROR_DATABASE: NO CONTINUAR'
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios') THEN 'ERROR_BASE_SCHEMA: NO CONTINUAR'
        WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios' AND COLUMN_NAME IN ('id','nombre','categoria','descripcion','contacto','fecha_creacion')) <> 6 THEN 'ERROR_BASE_SCHEMA: NO CONTINUAR'
        WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios' AND COLUMN_NAME IN ('ubicacion','sitio_web','imagen_url','estado','fecha_actualizacion')) = 0
         AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'negocios' AND INDEX_NAME = 'idx_negocios_estado_categoria')
         AND NOT EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('videos','galeria_imagenes')) THEN 'CLEAN: solo ejecutar UP tras respaldo.'
        WHEN (SELECT COUNT(*) FROM (
              SELECT 'negocios' AS TABLE_NAME, 'ubicacion' AS COLUMN_NAME, 'varchar' AS DATA_TYPE, 'varchar(255)' AS COLUMN_TYPE, 255 AS CHARACTER_MAXIMUM_LENGTH, 'YES' AS IS_NULLABLE, 'NULL' AS DEFAULT_KIND, CAST(NULL AS CHAR(100)) AS DEFAULT_VALUE, 'NONE' AS EXTRA_KIND, NULL AS CHARACTER_SET_NAME, NULL AS COLLATION_NAME
              UNION ALL SELECT 'negocios','sitio_web','varchar','varchar(500)',500,'YES','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'negocios','imagen_url','varchar','varchar(500)',500,'YES','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'negocios','estado','enum','enum(''borrador'',''publicado'',''archivado'')',NULL,'NO','LITERAL','borrador','NONE',NULL,NULL
              UNION ALL SELECT 'negocios','fecha_actualizacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'ON_UPDATE',NULL,NULL
              UNION ALL SELECT 'videos','id','int','int',NULL,'NO','NULL',NULL,'AUTO_INCREMENT',NULL,NULL
              UNION ALL SELECT 'videos','titulo','varchar','varchar(150)',150,'NO','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'videos','descripcion','text','text',NULL,'YES','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'videos','video_url','varchar','varchar(500)',500,'NO','NULL',NULL,'NONE','utf8mb4','utf8mb4_bin'
              UNION ALL SELECT 'videos','miniatura_url','varchar','varchar(500)',500,'YES','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'videos','estado','enum','enum(''borrador'',''publicado'',''archivado'')',NULL,'NO','LITERAL','borrador','NONE',NULL,NULL
              UNION ALL SELECT 'videos','fecha_creacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'videos','fecha_actualizacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'ON_UPDATE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','id','int','int',NULL,'NO','NULL',NULL,'AUTO_INCREMENT',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','titulo','varchar','varchar(150)',150,'NO','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','descripcion','text','text',NULL,'YES','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','imagen_url','varchar','varchar(500)',500,'NO','NULL',NULL,'NONE','utf8mb4','utf8mb4_bin'
              UNION ALL SELECT 'galeria_imagenes','texto_alternativo','varchar','varchar(255)',255,'NO','NULL',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','orden','int','int unsigned',NULL,'NO','LITERAL','0','NONE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','estado','enum','enum(''borrador'',''publicado'',''archivado'')',NULL,'NO','LITERAL','borrador','NONE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','fecha_creacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'NONE',NULL,NULL
              UNION ALL SELECT 'galeria_imagenes','fecha_actualizacion','timestamp','timestamp',NULL,'NO','CURRENT_TIMESTAMP',NULL,'ON_UPDATE',NULL,NULL
        ) AS e
        JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = e.TABLE_NAME AND c.COLUMN_NAME = e.COLUMN_NAME
        WHERE LOWER(c.DATA_TYPE) = e.DATA_TYPE AND LOWER(c.COLUMN_TYPE) = e.COLUMN_TYPE
          AND (e.CHARACTER_MAXIMUM_LENGTH IS NULL OR c.CHARACTER_MAXIMUM_LENGTH <=> e.CHARACTER_MAXIMUM_LENGTH)
          AND c.IS_NULLABLE = e.IS_NULLABLE
          AND (e.CHARACTER_SET_NAME IS NULL OR c.CHARACTER_SET_NAME <=> e.CHARACTER_SET_NAME)
          AND (e.COLLATION_NAME IS NULL OR c.COLLATION_NAME <=> e.COLLATION_NAME)
          AND ((e.DEFAULT_KIND = 'CURRENT_TIMESTAMP' AND LOWER(REPLACE(COALESCE(c.COLUMN_DEFAULT,''),'()','')) = 'current_timestamp')
            OR (e.DEFAULT_KIND = 'LITERAL' AND CAST(c.COLUMN_DEFAULT AS CHAR) <=> e.DEFAULT_VALUE)
            OR (e.DEFAULT_KIND = 'NULL' AND c.COLUMN_DEFAULT IS NULL))
          AND ((e.EXTRA_KIND = 'AUTO_INCREMENT' AND LOWER(c.EXTRA) LIKE '%auto_increment%')
            OR (e.EXTRA_KIND = 'ON_UPDATE' AND LOWER(c.EXTRA) LIKE '%on update current_timestamp%')
            OR (e.EXTRA_KIND = 'NONE' AND LOWER(COALESCE(c.EXTRA,'')) NOT LIKE '%auto_increment%' AND LOWER(COALESCE(c.EXTRA,'')) NOT LIKE '%on update current_timestamp%'))
        ) = 22
         AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('videos','galeria_imagenes') AND UPPER(ENGINE) = 'INNODB' AND LOWER(TABLE_COLLATION) = 'utf8mb4_unicode_ci') = 2
         AND (SELECT COUNT(DISTINCT CONCAT(TABLE_NAME, ':', INDEX_NAME)) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'videos' AND INDEX_NAME IN ('PRIMARY','uq_videos_video_url','idx_videos_estado_fecha')) OR (TABLE_NAME = 'galeria_imagenes' AND INDEX_NAME IN ('PRIMARY','uq_galeria_imagen_url','idx_galeria_estado_orden')) OR (TABLE_NAME = 'negocios' AND INDEX_NAME = 'idx_negocios_estado_categoria'))) = 7
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'negocios' AND s.INDEX_NAME = 'idx_negocios_estado_categoria' AND s.NON_UNIQUE = 1 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'estado' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 2 AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s2 WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = 'categoria' AND s2.SUB_PART IS NULL))
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'videos' AND s.INDEX_NAME = 'PRIMARY' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'id' AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1)
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'videos' AND s.INDEX_NAME = 'uq_videos_video_url' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'video_url' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1)
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'videos' AND s.INDEX_NAME = 'idx_videos_estado_fecha' AND s.NON_UNIQUE = 1 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'estado' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 2 AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s2 WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = 'fecha_creacion' AND s2.SUB_PART IS NULL))
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'galeria_imagenes' AND s.INDEX_NAME = 'PRIMARY' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'id' AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1)
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'galeria_imagenes' AND s.INDEX_NAME = 'uq_galeria_imagen_url' AND s.NON_UNIQUE = 0 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'imagen_url' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 1)
         AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'galeria_imagenes' AND s.INDEX_NAME = 'idx_galeria_estado_orden' AND s.NON_UNIQUE = 1 AND s.SEQ_IN_INDEX = 1 AND s.COLUMN_NAME = 'estado' AND s.SUB_PART IS NULL AND (SELECT COUNT(*) FROM information_schema.STATISTICS x WHERE x.TABLE_SCHEMA = s.TABLE_SCHEMA AND x.TABLE_NAME = s.TABLE_NAME AND x.INDEX_NAME = s.INDEX_NAME) = 2 AND EXISTS (SELECT 1 FROM information_schema.STATISTICS s2 WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA AND s2.TABLE_NAME = s.TABLE_NAME AND s2.INDEX_NAME = s.INDEX_NAME AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = 'orden' AND s2.SUB_PART IS NULL))
        THEN 'COMPLETE: definiciones coinciden; no ejecutar UP.'
        ELSE 'PARTIAL: faltan objetos o hay definiciones/tipos/índices incorrectos; NO ejecutar UP completo.'
    END AS clasificacion;

-- Limpio: todas las comprobaciones de objetos nuevos FALTA y clasificación CLEAN.
-- Completo: todas CORRECTA y clasificación COMPLETE.
-- Parcial o tipos incorrectos: clasificación PARTIAL; no ejecutar UP completo.
