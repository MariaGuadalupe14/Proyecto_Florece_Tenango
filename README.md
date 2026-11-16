# Florece Tenango

Sitio informativo y audiovisual sobre la floricultura y la comunidad de Tenango de las Flores. Esta etapa usa HTML5, CSS3 y JavaScript del navegador; no requiere paquetes, compilación, framework ni servidor de aplicación.

## Abrir el proyecto

Abre `index.html` con doble clic. En Visual Studio Code también puedes abrir la carpeta y utilizar una extensión como Live Server para ver la página desde una dirección local. El aviso de privacidad es una página independiente: `privacidad.html`.

## Organización

- `index.html`: Inicio, entrevistas a floricultores, galería, videos, centros capacitadores y acceso visual.
- `styles.css`: identidad visual, disposición de tarjetas, acceso y adaptaciones para móvil y tableta.
- `script.js`: menú móvil, mostrar u ocultar contraseña y comportamiento local del acceso demostrativo.
- `privacidad.html`: información sobre el funcionamiento y los datos del prototipo.

## Contenido pendiente

Las entrevistas aún no tienen nombres ni fotografías; las tarjetas están marcadas como pendientes. Las imágenes de la galería y las portadas de video son provisionales de Unsplash y no representan lugares específicos de Tenango. Los reproductores de video se añadirán cuando haya archivos autorizados. Los centros capacitadores, evaluadores y certificadores no se nombran hasta confirmar sus datos y especialidades; tampoco se inventan contactos o enlaces oficiales.

El logotipo transparente `Imagenes/SF_Logo_Florece_Tenango.png` está integrado en el encabezado, el pie de página y el aviso de privacidad. La variante transparente se usa para que se adapte al fondo marfil sin un recuadro blanco.

## Inicio de sesión

La tarjeta de acceso es demostrativa. No verifica cuentas ni envía ni guarda el correo o la contraseña. El botón valida los campos en el navegador, los limpia y muestra un aviso; no existe un formulario que pueda enviar esos datos. No hay registro, panel administrativo, base de datos ni backend.

Los enlaces de fotografía y los créditos están en `index.html`. Para sustituir una foto, agrega el archivo autorizado al proyecto, cambia el valor de `src` por una ruta local como `images/foto.webp` y actualiza su texto alternativo y crédito.
