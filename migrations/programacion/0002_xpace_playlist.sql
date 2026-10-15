-- Local programming belongs to a registered venue/channel, never a brand.
CREATE TABLE IF NOT EXISTS xpace_playlist_binding (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 venue_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 circuit_id TEXT NOT NULL DEFAULT '',
 playlist_id TEXT NOT NULL UNIQUE,
 source_screen TEXT NOT NULL UNIQUE,
 channel_kind TEXT NOT NULL CHECK(channel_kind IN ('music','signage')),
 auto_mode TEXT NOT NULL DEFAULT 'none' CHECK(auto_mode IN ('none','screen')),
 state TEXT NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','active')),
 created_at INTEGER NOT NULL,
 created_by TEXT NOT NULL,
 UNIQUE(project_id,venue_id,channel_id)
);
CREATE TABLE IF NOT EXISTS xpace_playlist_screen (
 screen_id TEXT PRIMARY KEY,
 binding_id TEXT NOT NULL REFERENCES xpace_playlist_binding(id),
 associated_at INTEGER NOT NULL,
 associated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS xpace_playlist_screen_binding ON xpace_playlist_screen(binding_id);
CREATE TABLE IF NOT EXISTS xpace_playlist_request (
 binding_id TEXT NOT NULL,
 actor TEXT NOT NULL,
 request_id TEXT NOT NULL,
 body_hash TEXT NOT NULL,
 result TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(binding_id,actor,request_id)
) WITHOUT ROWID;
