/* Clave de navegador de Google Maps de la casa, compartida (Carlos, 15-oct-2026).
 * Es la misma que ya usa adcelerate/demo/best/ (publicable: Google la restringe por referrer, no es un secreto
 * de servidor). Vive en un solo sitio para que las otras webs no la copien: admira.store y xpaceos.com la cargan
 * desde aquí para la puerta de Google Maps de sus locales (/xpacios/puerta/). Para que funcione allí, la clave
 * tiene que admitir sus referrers en Google Cloud (lo hace Carlos): www.admira.store, admira.store,
 * www.xpaceos.com y xpaceos.com.
 */
(function (root) { root.ADMIRA_GOOGLE_MAPS_KEY = root.ADMIRA_GOOGLE_MAPS_KEY || 'AIzaSyDOQTBlJYugpPBPuSMlRg74tu8Gvmq7mKA'; })(typeof window !== 'undefined' ? window : globalThis);
