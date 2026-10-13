// Shared playlist vocabulary: an HTML/Xperiencia asset must reach the iframe renderer.
// URL validation and iframe permissions remain the responsibility of their existing callers.
export function assetTypeOf(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "interactive" || type === "xperiencia") return "interactive";
  if (type === "video" || type === "animation") return "video";
  if (["audio", "music", "locucion"].includes(type)) return "audio";
  return "image";
}
