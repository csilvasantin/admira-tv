// Shared playlist vocabulary: an HTML/Xperiencia asset must reach the iframe renderer.
// URL validation and iframe permissions remain the responsibility of their existing callers.
export function assetTypeOf(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "interactive" || type === "xperiencia") return "interactive";
  // Elemento URL (20-nov-2026): una web cualquiera a pantalla completa va por el mismo iframe que una Xperiencia.
  if (type === "url" || type === "web" || type === "webpage") return "interactive";
  if (type === "video" || type === "animation") return "video";
  if (["audio", "music", "locucion"].includes(type)) return "audio";
  return "image";
}
