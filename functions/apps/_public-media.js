export const PUBLIC_MEDIA_SLUGS = new Set([
  "dashboard", "digitalsignage", "contentcatalogue", "support", "pushnotifications",
  "virtualassistant", "gamification", "iotmanager", "videoanalytics", "radioanalytics",
  "socialwifi", "queuemanager", "roombooking", "audiobranding", "olfactorymarketing",
  "virtualreality", "augmentedreality", "xpaceos", "yarig"
]);

export function publicMediaFile(file, extension) {
  const match = new RegExp("^([a-z0-9_-]+)\\." + extension + "$", "i").exec(String(file || ""));
  return match && PUBLIC_MEDIA_SLUGS.has(match[1].toLowerCase()) ? match[0] : "";
}
