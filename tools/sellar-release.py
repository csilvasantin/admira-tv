#!/usr/bin/env python3
"""Pone un sello de release nuevo en admira.tv, listo para ./deploy.sh.

  sellar-release.py <sello> <agente> <equipo> [novedad …]

Hace lo que hasta ahora se hacía a mano antes de cada publicación (14-oct-2026):
  · el sello canónico (<meta admiranext-version> de index.html) y, con tools/sella-versiones.py,
    todos los literales de versión y los ?v= de caché de las páginas;
  · la caché del service worker (sw.js → admira-shell-<sello>);
  · la firma (release-signature.json: versión, agente, equipo);
  · las novedades del sello (novedades.json[<sello>], si se pasan).
Lo usa el flujo de publicación automática (.github/workflows/publicar-admira-tv.yml) y vale igual a mano.
"""
import collections
import json
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SELLO_OK = re.compile(r"^v\.\d{2}\.\d{2}\.\d{4}\.r\d+\.\d{2}:\d{2}$")


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    sello, agente, equipo, novedades = argv[0], argv[1].strip(), argv[2].strip(), [n.strip() for n in argv[3:] if n.strip()]
    if not SELLO_OK.match(sello):
        sys.exit(f"✖ sello con forma rara: {sello} (esperado v.DD.MM.AAAA.rN.HH:MM)")
    if not agente or not equipo:
        sys.exit("✖ hace falta agente y equipo para la firma")

    index = RAIZ / "index.html"
    texto = index.read_text(encoding="utf-8")
    nuevo, n = re.subn(r'(<meta name="admiranext-version" content=")[^"]*(")', lambda m: m[1] + sello + m[2], texto)
    if n != 1:
        sys.exit("✖ no encuentro el sello canónico en index.html")
    index.write_text(nuevo, encoding="utf-8")

    sw = RAIZ / "sw.js"
    texto = sw.read_text(encoding="utf-8")
    nuevo, n = re.subn(r"^const CACHE = 'admira-shell-[^']*';$", f"const CACHE = 'admira-shell-{sello}';", texto, flags=re.M)
    if n != 1:
        sys.exit("✖ no encuentro la constante CACHE de sw.js")
    sw.write_text(nuevo, encoding="utf-8")

    firma = {"version": sello, "agent": agente, "deployer": agente, "machine": equipo, "signature": f"{agente} · {equipo}"}
    (RAIZ / "release-signature.json").write_text(json.dumps(firma, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if novedades:
        ruta = RAIZ / "novedades.json"
        datos = json.loads(ruta.read_text(encoding="utf-8"), object_pairs_hook=collections.OrderedDict) if ruta.exists() else collections.OrderedDict()
        salida = collections.OrderedDict()
        puesto = False
        for clave, valor in datos.items():
            if clave == sello:
                continue
            salida[clave] = valor
            if clave == "default" and not puesto:
                salida[sello] = novedades[:4]
                puesto = True
        if not puesto:
            salida[sello] = novedades[:4]
        ruta.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    subprocess.run([sys.executable, str(RAIZ / "tools" / "sella-versiones.py")], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, str(RAIZ / "tools" / "sella-versiones.py"), "--check"], check=True)
    print(f"✓ sellado {sello} · {agente} · {equipo}")


if __name__ == "__main__":
    main(sys.argv[1:])
