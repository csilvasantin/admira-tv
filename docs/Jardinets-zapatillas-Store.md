# Jardinets · zapatillas del poste y acceso a la Store

Encargo de Carlos, 10-09-2026. Misión Yokup `FLT-100187` (Hoy #76).

En el panorama de Jardinets, las dos zapatillas del poste metálico son enlaces:

- Superior: abre `https://digitaltwin.ieu.ai/` directamente en la misma pestaña.
- Inferior: abre el paseo desde Jardinets hasta la llegada exterior de
  **Store · Santa Rosa 19**. Se detiene en el panorama de llegada del número 19,
  como en la referencia de Carlos. Solo **Acceso interior** abre IEU.

Las zonas siguen las zapatillas al girar o acercar la cámara. Se ocultan fuera de
ese panorama, al ocultar la selección o durante otro recorrido/control de player.
Admiten teclado y muestran su destino al recibir foco o pasar el puntero.

El paseo descubre conexiones fotográficas dirigidas y vuelve a comprobar cada
salto. No entra automáticamente al interior al llegar. Se puede pausar, reanudar
o cancelar; una conexión no disponible detiene el recorrido con un aviso.

## Selección de Store en IEU

La captura de Carlos muestra la oficina **Store** seleccionada en IEU. Esa
selección se conserva en el navegador de IEU (`dt.current_site`). Su aplicación
actual no interpreta un parámetro de URL para seleccionar oficina. El enlace
superior elimina el recorrido y la página intermedia, pero en una sesión nueva
puede exigir iniciar sesión y seleccionar Store; si se dejó otra oficina, IEU
conserva esa otra selección. No se presenta el enlace raíz como una selección
forzada de Store. Añadir un enlace independiente de sesión requiere una mejora
coordinada en IEU; su código no está en este repositorio.

## Verificación

Pruebas del resolvedor de llegada, lanzamiento desde origen permitido, destinos
separados y motor de recorrido. La llegada Store exige el panorama de destino,
no el radio de 18 m usado por los demás recorridos. Referencias: fotografía
exterior del número 19 a 4 m y escena interior Store aportadas por Carlos.

Entradas: `adcelerate/demo/js/jardinets-shoes.js`,
`admiraxperience/store-visit.js`, `admiraxperience/office.js`.

Si Google cambia una conexión durante el recorrido, se recalcula desde el panorama
actual hasta tres veces. Tocar la calle o sus controles cancela esa recuperación.
