'use strict';

const express = require('express');
const crypto = require('crypto');

const STATUS_VALUES = new Set(['borrador', 'publicado', 'archivado']);
const TRUSTED_PAGES_ORIGIN = 'https://proyecto-florece-tenango.pages.dev';

function isTrustedOrigin(origin) {
    if (origin === TRUSTED_PAGES_ORIGIN) return true;
    if (process.env.NODE_ENV === 'production' || typeof origin !== 'string') return false;
    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function csrfMatches(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string') return false;
    const left = Buffer.from(provided, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validText(value, max, required = false) {
    if (typeof value !== 'string') return !required && (value === null || value === undefined);
    const trimmed = value.trim();
    return (required ? trimmed.length > 0 : true) && trimmed.length <= max;
}

function isSafePublicUrl(value, { allowLocalPath = false, allowedHosts } = {}) {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string' || value.length > 500) return false;
    const candidate = value.trim();
    if (!candidate) return true;
    if (allowLocalPath && !candidate.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
        return !candidate.split('/').includes('..') && !candidate.includes('\\');
    }
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
            (!allowedHosts || allowedHosts.has(parsed.hostname.toLowerCase()));
    } catch {
        return false;
    }
}

function validatePayload(type, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'El contenido enviado no es válido.';
    if (type === 'comercios') {
        if (!validText(body.nombre, 150, true) || !validText(body.categoria, 100) ||
            !validText(body.descripcion, 2000) || !validText(body.contacto, 150) ||
            !validText(body.ubicacion, 255) || !validText(body.sitio_web, 500) ||
            !validText(body.imagen_url, 500) ||
            !isSafePublicUrl(body.sitio_web) || !isSafePublicUrl(body.imagen_url, { allowLocalPath: true })) {
            return 'Revisa los campos del comercio y sus enlaces.';
        }
    } else if (type === 'videos') {
        const allowedVideoHosts = new Set(['drive.google.com', 'youtube.com', 'www.youtube.com', 'youtu.be']);
        if (!validText(body.titulo, 150, true) || !validText(body.descripcion, 2000) ||
            !validText(body.video_url, 500, true) || !validText(body.miniatura_url, 500) ||
            !isSafePublicUrl(body.video_url, { allowedHosts: allowedVideoHosts }) ||
            !isSafePublicUrl(body.miniatura_url, { allowLocalPath: true })) {
            return 'Revisa los campos del video y utiliza un enlace HTTPS compatible.';
        }
    } else if (type === 'galeria') {
        if (!validText(body.titulo, 150, true) || !validText(body.descripcion, 2000) ||
            !validText(body.imagen_url, 500, true) || !validText(body.texto_alternativo, 255, true) ||
            !isSafePublicUrl(body.imagen_url, { allowLocalPath: true }) ||
            !Number.isInteger(Number(body.orden)) || Number(body.orden) < 0 || Number(body.orden) > 100000) {
            return 'Revisa los campos de la imagen y su orden.';
        }
    }
    if (body.estado !== undefined && !STATUS_VALUES.has(body.estado)) return 'El estado indicado no es válido.';
    return null;
}

const DEFINITIONS = {
    comercios: {
        table: 'negocios',
        publicSelect: 'id, nombre, categoria, descripcion, contacto, ubicacion, sitio_web, imagen_url, fecha_creacion, fecha_actualizacion',
        adminSelect: 'id, nombre, categoria, descripcion, contacto, ubicacion, sitio_web, imagen_url, estado, fecha_creacion, fecha_actualizacion',
        columns: ['nombre', 'categoria', 'descripcion', 'contacto', 'ubicacion', 'sitio_web', 'imagen_url'],
        searchColumn: 'nombre',
        order: 'fecha_actualizacion DESC, id DESC'
    },
    videos: {
        table: 'videos',
        publicSelect: 'id, titulo, descripcion, video_url, miniatura_url, fecha_creacion, fecha_actualizacion',
        adminSelect: 'id, titulo, descripcion, video_url, miniatura_url, estado, fecha_creacion, fecha_actualizacion',
        columns: ['titulo', 'descripcion', 'video_url', 'miniatura_url'],
        searchColumn: 'titulo',
        order: 'fecha_creacion DESC, id DESC'
    },
    galeria: {
        table: 'galeria_imagenes',
        publicSelect: 'id, titulo, descripcion, imagen_url, texto_alternativo, orden, fecha_creacion, fecha_actualizacion',
        adminSelect: 'id, titulo, descripcion, imagen_url, texto_alternativo, orden, estado, fecha_creacion, fecha_actualizacion',
        columns: ['titulo', 'descripcion', 'imagen_url', 'texto_alternativo', 'orden'],
        searchColumn: 'titulo',
        order: 'orden ASC, id ASC'
    }
};

function createContentRouter({ db, requireRole }) {
    const router = express.Router();

    router.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
    });

    router.use('/admin', requireRole('administrador'));
    router.use('/admin', (req, res, next) => {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
        if (!isTrustedOrigin(req.get('Origin'))) return res.status(403).json({ mensaje: 'Origen no autorizado.' });
        if (!csrfMatches(req.get('X-CSRF-Token'), req.session?.csrfToken)) {
            return res.status(403).json({ mensaje: 'Token CSRF no válido.' });
        }
        next();
    });

    async function audit(req, event, detail) {
        try {
            await db.execute(
                `INSERT INTO registros_actividad (usuario_id, evento, descripcion, direccion_ip)
                 VALUES (?, ?, ?, ?)`,
                [req.session.usuario.id, event, detail.slice(0, 255), req.ip]
            );
        } catch (error) {
            // El fallo de auditoría no revierte una operación CRUD ya confirmada.
            console.error('No se pudo registrar la actividad administrativa:', error.code || 'UNKNOWN_ERROR');
        }
    }

    for (const [type, definition] of Object.entries(DEFINITIONS)) {
        const { table, publicSelect, adminSelect, columns, searchColumn, order } = definition;
        router.get(`/${type}`, async (req, res) => {
            try {
                const [rows] = await db.execute(
                    `SELECT ${publicSelect} FROM ${table} WHERE estado = 'publicado' ORDER BY ${order}`
                );
                res.json({ items: rows });
            } catch (error) {
                console.error(`Error al consultar ${type}:`, error.code || 'UNKNOWN_ERROR');
                res.status(503).json({ mensaje: 'El contenido no está disponible temporalmente.' });
            }
        });

        router.get(`/admin/${type}`, async (req, res) => {
            try {
                const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
                const [rows] = await db.execute(
                    `SELECT ${adminSelect} FROM ${table} WHERE (? = '' OR ${searchColumn} LIKE CONCAT('%', ?, '%')) ORDER BY ${order}`,
                    [search, search]
                );
                res.json({ items: rows });
            } catch (error) {
                console.error(`Error al listar ${type}:`, error.code || 'UNKNOWN_ERROR');
                res.status(503).json({ mensaje: 'No se pudo consultar el contenido.' });
            }
        });

        router.post(`/admin/${type}`, async (req, res) => {
            const validationError = validatePayload(type, req.body);
            if (validationError) return res.status(400).json({ mensaje: validationError });
            const values = columns.map(column => req.body[column] === undefined ? null :
                (typeof req.body[column] === 'string' ? req.body[column].trim() : Number(req.body[column])));
            const state = req.body.estado || 'borrador';
            const insertColumns = [...columns, 'estado'];
            try {
                const [result] = await db.execute(
                    `INSERT INTO ${table} (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
                    [...values, state]
                );
                await audit(req, 'CONTENIDO_CREADO', `${type}: id ${result.insertId}`);
                return res.status(201).json({ mensaje: 'Registro creado.', id: result.insertId });
            } catch (error) {
                console.error(`Error al crear ${type}:`, error.code || 'UNKNOWN_ERROR');
                return res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ mensaje: 'No se pudo guardar el registro.' });
            }
        });

        router.put(`/admin/${type}/:id`, async (req, res) => {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensaje: 'Identificador no válido.' });
            const validationError = validatePayload(type, req.body);
            if (validationError) return res.status(400).json({ mensaje: validationError });
            // Sitio web es opcional: si el formulario lo omite, conserva el valor existente.
            const updateColumns = type === 'comercios' && req.body.sitio_web === undefined
                ? columns.filter(column => column !== 'sitio_web')
                : columns;
            const assignments = updateColumns.map(column => `${column} = ?`);
            const values = updateColumns.map(column => req.body[column] === undefined ? null :
                (typeof req.body[column] === 'string' ? req.body[column].trim() : Number(req.body[column])));
            assignments.push('estado = ?');
            values.push(req.body.estado || 'borrador');
            try {
                const [result] = await db.execute(
                    `UPDATE ${table} SET ${assignments.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                    [...values, id]
                );
                if (!result.affectedRows) return res.status(404).json({ mensaje: 'Registro no encontrado.' });
                await audit(req, 'CONTENIDO_EDITADO', `${type}: id ${id}`);
                return res.json({ mensaje: 'Registro actualizado.' });
            } catch (error) {
                console.error(`Error al editar ${type}:`, error.code || 'UNKNOWN_ERROR');
                return res.status(500).json({ mensaje: 'No se pudo actualizar el registro.' });
            }
        });

        router.patch(`/admin/${type}/:id/estado`, async (req, res) => {
            const id = Number(req.params.id);
            const { estado } = req.body || {};
            if (!Number.isSafeInteger(id) || id < 1 || !STATUS_VALUES.has(estado)) {
                return res.status(400).json({ mensaje: 'Identificador o estado no válido.' });
            }
            try {
                const [result] = await db.execute(
                    `UPDATE ${table} SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                    [estado, id]
                );
                if (!result.affectedRows) return res.status(404).json({ mensaje: 'Registro no encontrado.' });
                await audit(req, `CONTENIDO_${estado.toUpperCase()}`, `${type}: id ${id}`);
                return res.json({ mensaje: `Registro ${estado}.` });
            } catch (error) {
                console.error(`Error al cambiar estado de ${type}:`, error.code || 'UNKNOWN_ERROR');
                return res.status(500).json({ mensaje: 'No se pudo cambiar el estado.' });
            }
        });

        router.delete(`/admin/${type}/:id`, async (req, res) => {
            const id = Number(req.params.id);
            if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ mensaje: 'Identificador no válido.' });
            try {
                const [result] = await db.execute(
                    `UPDATE ${table} SET estado = 'archivado', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`,
                    [id]
                );
                if (!result.affectedRows) return res.status(404).json({ mensaje: 'Registro no encontrado.' });
                await audit(req, 'CONTENIDO_ARCHIVADO', `${type}: id ${id}`);
                return res.json({ mensaje: 'Registro archivado; puedes volver a publicarlo desde el panel.' });
            } catch (error) {
                console.error(`Error al archivar ${type}:`, error.code || 'UNKNOWN_ERROR');
                return res.status(500).json({ mensaje: 'No se pudo archivar el registro.' });
            }
        });
    }

    return router;
}

module.exports = { createContentRouter, validatePayload, isSafePublicUrl };
