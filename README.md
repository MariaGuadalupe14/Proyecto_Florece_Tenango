# Florece Tenango

Sitio informativo y audiovisual sobre la floricultura y la comunidad de Tenango de las Flores. Esta etapa usa HTML5, CSS3 y JavaScript del navegador; no requiere paquetes, compilación, framework ni servidor de aplicación.

## Abrir el proyecto

Abre `index.html` con doble clic. En Visual Studio Code también puedes abrir la carpeta y utilizar una extensión como Live Server para ver la página desde una dirección local. El aviso de privacidad es una página independiente: `privacidad.html`.

## Organización

- `index.html`: página existente, con la sección de capacitación y el panel de Xóchitl integrados sin retirar las secciones previas.
- `styles.css`: identidad visual, disposición de tarjetas, acceso y adaptaciones para móvil y tableta, más el catálogo y chat.
- `script.js`: comportamiento existente del menú y el acceso demostrativo, además de filtros, renderizado seguro del catálogo y conversación local de Xóchitl.
- `catalogo.js`: fuente única de cursos y recursos usada tanto por el catálogo visible como por Xóchitl.
- `recomendador.js`: adaptación local de búsqueda greedy best-first.
- `privacidad.html`: información sobre el funcionamiento y los datos del prototipo.

## Contenido pendiente

Las entrevistas aún no tienen nombres ni fotografías; las tarjetas están marcadas como pendientes. Las imágenes de la galería son provisionales de Unsplash y no representan lugares específicos de Tenango. La sección Videos reproduce los archivos locales `Videos_Reels/Video1.mp4` y `Video2.mp4`, con las portadas entregadas en esa carpeta. Cada archivo supera los 100 MiB; GitHub bloquea archivos de ese tamaño en Git normal, por lo que para publicarlos tendrás que comprimirlos por debajo del límite o usar Git LFS. Los centros capacitadores, evaluadores y certificadores no se nombran hasta confirmar sus datos y especialidades; tampoco se inventan contactos o enlaces oficiales.

El logotipo transparente `Imagenes/SF_Logo_Florece_Tenango.png` está integrado en el encabezado, el pie de página y el aviso de privacidad. La variante transparente se usa para que se adapte al fondo marfil sin un recuadro blanco.

## Inicio de sesión

La tarjeta de acceso es demostrativa. No verifica cuentas ni envía ni guarda el correo o la contraseña. El botón valida los campos en el navegador, los limpia y muestra un aviso; no existe un formulario que pueda enviar esos datos. No hay registro, panel administrativo, base de datos ni backend.

Los enlaces de fotografía y los créditos están en `index.html`. Para sustituir una foto, agrega el archivo autorizado al proyecto, cambia el valor de `src` por una ruta local como `images/foto.webp` y actualiza su texto alternativo y crédito.

## Xóchitl y el catálogo

Xóchitl hace cinco preguntas adaptativas y permite volver a la pregunta anterior. No solicita información personal y las respuestas solo viven en memoria durante la página abierta. El catálogo permite buscar por curso o institución, filtrar por categoría y mostrar opciones marcadas como gratuitas.

El recomendador representa la consulta como un grafo conceptual: raíz → área → necesidad → registros candidatos. La frontera de candidatos se prioriza por `h(n) = 100 - puntuación`; toma primero el candidato con menor coste heurístico (mayor coincidencia) hasta reunir tres. La puntuación pondera área (35), necesidad (30), tipo de negocio (10), modalidad (10), presupuesto (10) y estado verificado (hasta 5). Es una adaptación greedy best-first del recorrido hacia candidatos, no un motor institucional ni una búsqueda de cursos en vivo. Las preferencias explícitas de modalidad no seleccionan una modalidad declarada incompatible; los datos desconocidos aparecen con una advertencia de confirmación. Para presupuesto gratuito se excluyen opciones marcadas como de pago y se advierte sobre costo desconocido.

Para agregar una opción, agrega un objeto a `window.FLORECE_CATALOG` en `catalogo.js`, con un `id` único, `name`, `provider`, `category`, `type`, `description`, `modality`, `duration`, `cost`, `free` (`true`, `false` o `null`), `status`, `certification`, `url` oficial y `tags` de temas/negocios. No marques como verificado un dato que no confirmaste. El catálogo y las recomendaciones se actualizan desde esa misma lista.

Los dos cursos de HubSpot se revisaron en sus páginas oficiales el 20 de noviembre de 2026: duración publicada de 5 h 18 min para redes sociales y 8 h 23 min para marketing de contenidos; ambos aparecen como gratuitos e incluyen certificación. La referencia inicial de duración ya no coincide. Google, CONDUSEF, ICATEP, Cisco y Google Safety aún requieren confirmar oferta, modalidad, precio/condiciones y/o reconocimiento vigentes; sus registros indican la incertidumbre aplicable.
