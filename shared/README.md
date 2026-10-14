# shared/ · módulo común de marca y proyecto

Copia sin cambios de `contexto.js`, `marca-blanca.js` y las hojas `marca-blanca*.css` de admira-design, rama
`morfeo/5979-marca-por-web`, commit `dafd63e`: [admira-design#2](https://github.com/csilvasantin/admira-design/pull/2)
(cada web viste la marca sobre su propio chrome), que va encima de
[admira-design#1](https://github.com/csilvasantin/admira-design/pull/1) (encargo #5934 · API y código común).
Todos los ficheros salen de la misma revisión.

No se editan aquí: cuando cambie admira-design se vuelven a copiar juntos. admira.tv carga el cargador con
`data-plataforma="tv"`, que usa `marca-blanca-tv.css` y las anclas de la barra de admira.tv; las demás hojas
están para que la copia sea completa. Lo propio de admira.tv vive en `admira-contexto.js` (carga, comandos
`/marca` y `/proyecto`, lecturas filtradas). Encargo #5979.
