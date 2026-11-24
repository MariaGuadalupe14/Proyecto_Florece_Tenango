-- Florece Tenango: módulos de comercios, videos y galería.
-- SOLO para un esquema LIMPIO: ejecutar primero migration-001-content-preflight.sql.
-- Si cualquier objeto de esta migración ya existe, NO ejecutar este archivo.
-- Respaldar la base antes de ejecutar manualmente. No se ejecuta desde Node.

ALTER TABLE negocios
    ADD COLUMN ubicacion VARCHAR(255) NULL AFTER contacto,
    ADD COLUMN sitio_web VARCHAR(500) NULL AFTER ubicacion,
    ADD COLUMN imagen_url VARCHAR(500) NULL AFTER sitio_web,
    ADD COLUMN estado ENUM('borrador', 'publicado', 'archivado') NOT NULL DEFAULT 'borrador' AFTER imagen_url,
    ADD COLUMN fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER fecha_creacion,
    ADD INDEX idx_negocios_estado_categoria (estado, categoria);

CREATE TABLE videos (
    id INT NOT NULL AUTO_INCREMENT,
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    video_url VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    miniatura_url VARCHAR(500) NULL,
    estado ENUM('borrador', 'publicado', 'archivado') NOT NULL DEFAULT 'borrador',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_videos_video_url (video_url),
    KEY idx_videos_estado_fecha (estado, fecha_creacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE galeria_imagenes (
    id INT NOT NULL AUTO_INCREMENT,
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT NULL,
    imagen_url VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    texto_alternativo VARCHAR(255) NOT NULL,
    orden INT UNSIGNED NOT NULL DEFAULT 0,
    estado ENUM('borrador', 'publicado', 'archivado') NOT NULL DEFAULT 'borrador',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_galeria_imagen_url (imagen_url),
    KEY idx_galeria_estado_orden (estado, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NOT EXISTS hace inocuo repetir solo el seed; UNIQUE protege además contra
-- duplicados concurrentes. Una colisión inesperada se reporta, no se oculta.
INSERT INTO videos (titulo, descripcion, video_url, estado)
SELECT seeds.titulo, seeds.descripcion, seeds.video_url, seeds.estado
FROM (
    SELECT 'Mercado Tenango de las Flores' AS titulo,
           'Reel audiovisual sobre el mercado de Tenango de las Flores.' AS descripcion,
           'https://drive.google.com/file/d/1XZAYz-KkDAl047EO_GFwjSe_ycTkAh3U/preview' AS video_url,
           'publicado' AS estado
    UNION ALL
    SELECT 'Mercado de las Flores',
           'Reel audiovisual sobre el mercado de las flores.',
           'https://drive.google.com/file/d/1fqybrwQCK0_6EPYu62fSdxX13I1jUea_/preview',
           'publicado'
) AS seeds
WHERE NOT EXISTS (SELECT 1 FROM videos v WHERE v.video_url = seeds.video_url);

-- Registra las 53 imágenes existentes sin mover ni duplicar archivos.
INSERT INTO galeria_imagenes
    (titulo, descripcion, imagen_url, texto_alternativo, orden, estado)
SELECT
    CONCAT('Fotografía de Tenango ', n),
    'Fotografía de Tenango de las Flores.',
    CONCAT('Fotos_Tenango/Galeria/tenango-', LPAD(n, 2, '0'), '.webp'),
    CONCAT('Fotografía de Tenango de las Flores, colección ', n, ' de 53'),
    n,
    'publicado'
FROM (
    SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
    UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
    UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
    UNION ALL SELECT 16 UNION ALL SELECT 17 UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20
    UNION ALL SELECT 21 UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25
    UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29 UNION ALL SELECT 30
    UNION ALL SELECT 31 UNION ALL SELECT 32 UNION ALL SELECT 33 UNION ALL SELECT 34 UNION ALL SELECT 35
    UNION ALL SELECT 36 UNION ALL SELECT 37 UNION ALL SELECT 38 UNION ALL SELECT 39 UNION ALL SELECT 40
    UNION ALL SELECT 41 UNION ALL SELECT 42 UNION ALL SELECT 43 UNION ALL SELECT 44 UNION ALL SELECT 45
    UNION ALL SELECT 46 UNION ALL SELECT 47 UNION ALL SELECT 48 UNION ALL SELECT 49 UNION ALL SELECT 50
    UNION ALL SELECT 51 UNION ALL SELECT 52 UNION ALL SELECT 53
) AS numeros
WHERE NOT EXISTS (
    SELECT 1 FROM galeria_imagenes g
    WHERE g.imagen_url = CONCAT('Fotos_Tenango/Galeria/tenango-', LPAD(numeros.n, 2, '0'), '.webp')
);
