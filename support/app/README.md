# Gestor de soporte · Admira.tv

Ruta: https://admira.tv/support/app/
Entrada: `/support/` (landing) y Flota CMS → **Asistencia**.

Tres pantallas, un `Incident` store (`store.js`, localStorage + BroadcastChannel):

| Vista | Copy CSO | Contrato |
| --- | --- | --- |
| P1 Radar | La flota no grita: entra en cola. | Cola priorizada, huérfanos Flota, merge/snooze/escalar. |
| P2 Sala | No vas al ticket: entras en la pantalla. | `?playerId=` crea INC al click. Nunca sala vacía. |
| P3 Parte | Se cierra con valor, no con “cerrado”. | assigned → in_field → resolved → valued. |

Ciclo marketing: **CAE → SE ASIGNA → SE CIERRA**. FLT-100395 / FLT-100396.

## Deep-links

- Radar: `/support/app/`
- Sala Flota: `/support/app/?view=sala&playerId=admiranext-mupi&source=asistencia_click`
- Parte: `/support/app/?view=parte&incidentId=INC-10482`

## Pruebas

```
node --test support/app/store.test.mjs support/app/app.test.mjs support-tester.test.mjs
```

Wireframe de referencia: https://www.admira.live/assets/demos/soporte-agentico-3p/
