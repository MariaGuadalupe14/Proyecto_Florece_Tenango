# Procedimiento de eliminaci&oacute;n segura

**Estado:** procedimiento; no se elimin&oacute; ni modific&oacute; informaci&oacute;n de MySQL.

## Principios

- No borrar cuentas, tablas, registros ni copias sin solicitud y autorizaci&oacute;n del responsable.
- Confirmar identidad y alcance de la solicitud usando el proceso acordado por el equipo; nunca pedir ni incluir contrase&ntilde;as en tickets, logs o evidencias.
- Determinar qu&eacute; tablas y respaldos pueden contener el dato. El esquema actual no est&aacute; incluido en el repositorio, as&iacute; que primero debe confirmarse con el administrador de MySQL.
- Definir y aprobar plazos de conservaci&oacute;n antes de habilitar borrados autom&aacute;ticos.

## Flujo para una solicitud

1. Registrar folio, fecha, solicitante autorizado, tipo de dato y finalidad, evitando copiar el contenido sensible en la bit&aacute;cora.
2. Confirmar alcance con el responsable y revisar obligaciones de conservaci&oacute;n, auditor&iacute;a, prevenci&oacute;n de fraude y respaldos.
3. Preparar la operaci&oacute;n en una base de prueba con datos sint&eacute;ticos. Confirmar claves exactas y posibles relaciones/cascadas; obtener doble revisi&oacute;n.
4. Antes de cualquier cambio de producci&oacute;n, obtener autorizaci&oacute;n expl&iacute;cita, ventana de mantenimiento y respaldo verificado cuando corresponda.
5. Ejecutar la eliminaci&oacute;n por identificadores espec&iacute;ficos y dentro de una transacci&oacute;n revisada. Comprobar filas afectadas y consultas posteriores; detenerse si el n&uacute;mero no coincide con lo aprobado.
6. Registrar solo metadatos de auditor&iacute;a (folio, operador, fecha, tablas afectadas y resultado), nunca contrase&ntilde;as, tokens ni el dato borrado.
7. Aplicar al vencimiento la pol&iacute;tica aprobada a copias cifradas. Una fila borrada de una tabla no desaparece necesariamente de respaldos, r&eacute;plicas, binlogs o medios antiguos.

## L&iacute;mites t&eacute;cnicos

`DELETE` de SQL no garantiza sobrescritura f&iacute;sica inmediata. La protecci&oacute;n de medios, cifrado de vol&uacute;menes y destrucci&oacute;n de claves dependen de la plataforma que aloje MySQL y deben verificarse con su administrador. No se implement&oacute; borrado autom&aacute;tico porque faltan esquema, retenci&oacute;n aprobada y autorizaci&oacute;n para cambiar datos reales.
