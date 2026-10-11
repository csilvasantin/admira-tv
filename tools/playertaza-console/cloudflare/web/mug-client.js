// Queue acceptance, gateway completion and physical playback are distinct facts.
export async function submitMug(body, options = {}) {
  const request = options.fetch || globalThis.fetch;
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const onState = options.onState || (() => {});
  const timeoutMs = options.timeoutMs ?? 45000;
  const show = (status, message, level = "") => {
    onState({ status, message, level });
    return { ok: status === "succeeded", status, message };
  };
  async function read(url, init = {}) {
    const response = await request(url, { ...init, signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || `Error HTTP ${response.status}`);
    return data;
  }
  show("submitting", body.op === "connect" ? "Solicitando prueba Bluetooth…" : "Solicitando envío…");
  try {
    const queued = await read("/api/mug", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (!queued.queued || !queued.id) {
      return show("unconfirmed", "El servidor no ofrece seguimiento de esta prueba. Resultado sin confirmar.", "bad");
    }
    show("queued", "Prueba en cola; esperando respuesta del Mac. Esto no confirma reproducción.");
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      await wait(Math.min(1500, Math.max(0, deadline - now())));
      const result = await read("/api/mug?id=" + encodeURIComponent(queued.id), { cache: "no-store" });
      // Never accept the latest result of a different client or an older gateway.
      if (result.id !== queued.id || result.op !== body.op) continue;
      if (result.status === "failed") {
        return show("failed", "Prueba fallida: " + (result.error || "el Mac no pudo completarla"), "bad");
      }
      if (result.status === "succeeded" && result.last_ok === true) {
        return show("succeeded", body.op === "connect"
          ? "Prueba Bluetooth completada. No confirma Wi-Fi ni reproducción en la taza."
          : "El Mac informa de una escritura. La reproducción en la taza sigue sin verificar.");
      }
    }
    return show("timeout", "Sin confirmación del Mac para esta prueba. Puede estar desconectado o usar un puente antiguo. Reproducción sin verificar.", "bad");
  } catch (error) {
    return show("failed", error.message || "No se pudo consultar el resultado. Reproducción sin verificar.", "bad");
  }
}

export function deviceSummary(status, result = {}, now = Date.now()) {
  const age = status.ble_age_ms;
  const detected = Boolean(status.ble_name && Number.isFinite(age) && age >= 0 && age < 30000);
  const device = status.ble_name || "taza no detectada";
  const link = detected ? "BLE detectado" : status.ble_name ? "detección antigua" : "sin detección reciente";
  let lastResult = "";
  if (result.ts && (result.op || result.error)) {
    const when = new Date(result.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const old = now - result.ts > 60000 ? " (anterior)" : "";
    const text = result.last_ok === true
      ? (result.op === "connect" ? "prueba BLE completada; reproducción sin verificar" : "escritura informada; reproducción sin verificar")
      : result.error || "fallida";
    lastResult = `Último informe del Mac · ${when}${old}: ${text}${result.id ? "" : " · sin identificador de prueba"}`;
  }
  return {
    device: device + (detected && status.ble_rssi != null ? ` · ${status.ble_rssi} dBm` : ""),
    link, lastResult,
    hint: (detected ? "El Mac ha detectado una señal Bluetooth de la taza. " : "No hay una detección Bluetooth reciente confirmada. ") +
      "Wi-Fi y reproducción: sin verificar. El envío de contenido sigue bloqueado hasta validar el protocolo."
  };
}
