-- Modelo único de playlists de admira.tv · E1 (8-oct-2026, diseño aprobado por Carlos).
-- D1 «admira-programacion», binding PROGRAMACION_DB (Pages admira-tv). Ver docs/playlists-modelo-unico.md.
--
-- Convenciones:
--   · Instantes en milisegundos UTC (INTEGER). Fechas de calendario 'YYYY-MM-DD' en hora de Europe/Madrid (TEXT).
--   · Listas y objetos en JSON dentro de TEXT (D1 es SQLite con JSON1).
--   · Toda entidad editable lleva `rev` (bloqueo optimista) y `escritura` (ficha de la última escritura: las sentencias
--     que acompañan a un UPDATE en el mismo db.batch sólo actúan si la ficha es la suya, así un 409 no deja rastro).
--   · Idempotente: se puede aplicar con `wrangler d1 migrations apply` o con `wrangler d1 execute --file` sin daño.

-- Versión global del modelo (sube en cada escritura: sirve de clave de caché) y banderas de despliegue.
CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0,
  esquema INTEGER NOT NULL DEFAULT 1,
  banderas TEXT NOT NULL DEFAULT '{}',
  actualizado_en INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO meta (id, version, esquema, banderas, actualizado_en)
VALUES (1, 0, 1, '{"motor":"apagado","sombra":false}', 0);

-- QUÉ se emite.
CREATE TABLE IF NOT EXISTS playlist (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  proyecto TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('fija', 'viva', 'mixta')),
  items TEXT NOT NULL DEFAULT '[]',          -- hasta 200: {tipo:'pieza',…} o {tipo:'hueco', regla, cuantas}
  reglas TEXT NOT NULL DEFAULT '[]',         -- reglas de contenido vivas (forma de cleanLive().content)
  opciones TEXT NOT NULL DEFAULT '{}',       -- {exacta, segundos}
  duracion_s INTEGER NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'manual',     -- manual · legado:kv-default · legado:kv-viva · pixeria-stock · …
  rev INTEGER NOT NULL DEFAULT 1,
  escritura TEXT NOT NULL DEFAULT '',
  creado_en INTEGER NOT NULL,
  creado_por TEXT NOT NULL DEFAULT '',
  actualizado_en INTEGER NOT NULL,
  actualizado_por TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS playlist_proyecto ON playlist (proyecto, actualizado_en DESC);

-- Historial: las 50 últimas revisiones de cada playlist (la poda va en el mismo batch que la escritura).
CREATE TABLE IF NOT EXISTS playlist_revision (
  playlist_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  datos TEXT NOT NULL,                       -- la entidad completa en esa revisión (JSON)
  autor TEXT NOT NULL DEFAULT '',
  en INTEGER NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (playlist_id, rev)
) WITHOUT ROWID;

-- A DÓNDE y CUÁNDO.
CREATE TABLE IF NOT EXISTS asignacion (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  proyecto TEXT NOT NULL DEFAULT '',
  destino TEXT NOT NULL,                     -- {all:[…], any:[…]} con la sintaxis de targetMatches
  directa INTEGER NOT NULL DEFAULT 0,        -- 1 si el destino es sólo pantalla:…
  fecha_desde TEXT,                          -- inclusiva; NULL = abierta
  fecha_hasta TEXT,                          -- inclusiva; NULL = abierta
  dias INTEGER NOT NULL DEFAULT 127,         -- L=1 M=2 X=4 J=8 V=16 S=32 D=64
  franjas TEXT NOT NULL DEFAULT '[]',        -- [{desde, hasta}] minutos locales; hasta <= desde cruza medianoche
  recurrencia TEXT,                          -- NULL · {tipo:'semanal', cada, ancla} · {tipo:'fechas', fechas}
  excepciones TEXT NOT NULL DEFAULT '[]',
  inicio_utc INTEGER NOT NULL,               -- cotas precalculadas (horario.rangoUtc) para filtrar en SQL
  fin_utc INTEGER NOT NULL,
  capa TEXT NOT NULL CHECK (capa IN ('emergencia', 'pagada', 'propia', 'por_defecto', 'relleno')),
  prioridad INTEGER NOT NULL,                -- 500 · 400 · 300 · 200 · 100 (derivada de la capa)
  peso INTEGER NOT NULL DEFAULT 0,
  mezcla TEXT NOT NULL CHECK (mezcla IN ('sustituye', 'fusiona', 'anade', 'intercala')),
  cadencia INTEGER,                          -- intercala: un spot cada N piezas de la base (NULL = 4)
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('borrador', 'activa', 'pausada', 'archivada')),
  ref_externa TEXT,                          -- kv:default:<pantalla> · kv:viva:<id> · grid:<booking> · …
  rev INTEGER NOT NULL DEFAULT 1,
  escritura TEXT NOT NULL DEFAULT '',
  creado_en INTEGER NOT NULL,
  creado_por TEXT NOT NULL DEFAULT '',
  actualizado_en INTEGER NOT NULL,
  actualizado_por TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS asignacion_vigencia ON asignacion (estado, fin_utc, inicio_utc);
CREATE INDEX IF NOT EXISTS asignacion_playlist ON asignacion (playlist_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS asignacion_ref ON asignacion (ref_externa) WHERE ref_externa IS NOT NULL;

-- Índice invertido del destino: etiqueta → asignaciones. Filtro previo de «qué le puede tocar a esta pantalla»
-- (la comprobación exacta por facetas la hace el resolver con targetMatches).
CREATE TABLE IF NOT EXISTS asignacion_destino (
  etiqueta TEXT NOT NULL,
  asignacion_id TEXT NOT NULL,
  modo TEXT NOT NULL CHECK (modo IN ('all', 'any')),
  PRIMARY KEY (etiqueta, asignacion_id, modo)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS asignacion_destino_asignacion ON asignacion_destino (asignacion_id);

CREATE TABLE IF NOT EXISTS asignacion_revision (
  asignacion_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  datos TEXT NOT NULL,
  autor TEXT NOT NULL DEFAULT '',
  en INTEGER NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (asignacion_id, rev)
) WITHOUT ROWID;

-- Circuitos definidos (grupos de pantallas con nombre; hoy viven dentro de admira-tv:playlist:live:v1).
CREATE TABLE IF NOT EXISTS circuito (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  destino TEXT NOT NULL,                     -- {all, any}
  activo INTEGER NOT NULL DEFAULT 1,
  rev INTEGER NOT NULL DEFAULT 1,
  escritura TEXT NOT NULL DEFAULT '',
  creado_en INTEGER NOT NULL,
  creado_por TEXT NOT NULL DEFAULT '',
  actualizado_en INTEGER NOT NULL,
  actualizado_por TEXT NOT NULL DEFAULT ''
);

-- Claves de servicio para escrituras servidor a servidor (Stock de Pixeria, parrilla…). Sólo el hash SHA-256:
-- el valor vive en la bóveda admira-vault y nunca aquí.
CREATE TABLE IF NOT EXISTS clave_servicio (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  ambitos TEXT NOT NULL DEFAULT '[]',        -- p. ej. ["playlist:escribir","proyecto:alcampo"]
  activa INTEGER NOT NULL DEFAULT 1,
  creado_en INTEGER NOT NULL,
  creado_por TEXT NOT NULL DEFAULT '',
  ultimo_uso INTEGER
);

-- Quién cambió qué y cuándo (una fila por escritura aceptada, en el mismo batch).
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  en INTEGER NOT NULL,
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,                      -- crear · actualizar · borrar · banderas
  entidad TEXT NOT NULL,                     -- playlist · asignacion · circuito · meta
  entidad_id TEXT NOT NULL,
  rev INTEGER,
  version INTEGER,                           -- meta.version resultante
  detalle TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS auditoria_entidad ON auditoria (entidad, entidad_id, en DESC);
CREATE INDEX IF NOT EXISTS auditoria_en ON auditoria (en DESC);

-- Modo sombra: lo que emite hoy el legado frente a lo que resolvería el motor nuevo, por pantalla.
CREATE TABLE IF NOT EXISTS sombra (
  pantalla TEXT NOT NULL,
  en INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  firma_legado TEXT NOT NULL DEFAULT '',
  firma_nueva TEXT NOT NULL DEFAULT '',
  coincide INTEGER NOT NULL DEFAULT 0,
  capa TEXT NOT NULL DEFAULT '',
  detalle TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (pantalla, en)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS sombra_discrepancias ON sombra (coincide, en DESC);
