# Guía de personalización avanzada (Keycloak)

## Niveles de personalización

| Nivel | Esfuerzo | Qué cambias | Resultado |
|-------|----------|-------------|-----------|
| **1. Variables CSS** | Bajo | `:root` en `login/resources/css/login.css` | Colores, tipografía, bordes |
| **2. Logo e imágenes** | Bajo | `login/resources/img/logo.svg` o `logo.png` | Marca visible en el login |
| **3. Textos** | Bajo | `login/messages/messages_es.properties` | Títulos, botones, mensajes en español |
| **4. Pie de página** | Medio | `login/footer.ftl` | Enlaces, aviso legal, tagline |
| **5. Plantillas HTML** | Alto | Copiar `.ftl` del JAR de Keycloak y editar | Layout completo (campos, registro, MFA) |
| **6. Emails** | Medio | Carpeta `email/` en el tema | Correos de recuperación, verificación |

---

## Cambios rápidos (recomendado empezar aquí)

### Colores de marca (sso-apps — usuarios)

Edita al inicio de `themes/sso-apps/login/resources/css/login.css`:

```css
:root {
    --sso-brand-primary: #TU_COLOR;
    --sso-brand-secondary: #TU_ACENTO;
    --sso-brand-text: #333333;
}
```

### Colores admin (sso-admin)

`themes/sso-admin/login/resources/css/login.css` — mismas variables con prefijo `--sso-admin-*`.

### Logo

1. Exporta tu logo como **SVG** o **PNG** (fondo transparente, ~200×48 px).
2. Sustituye `themes/sso-apps/login/resources/img/logo.svg`.
3. Si usas PNG, en el CSS cambia la línea:

   ```css
   background: url("../img/logo.png") center / contain no-repeat;
   ```

4. Reinicia Keycloak o refresca con Ctrl+F5 (`start-dev` no cachea temas).

### Textos del formulario

`themes/sso-apps/login/messages/messages_es.properties`:

```properties
loginTitleHtml=<span>Tu empresa</span>
doLogIn=Entrar
```

---

## Personalización “casi como página propia” (nivel 5)

Keycloak usa plantillas **FreeMarker** (`.ftl`). Para cambiar estructura (dos columnas, imagen lateral, sin mención Keycloak):

1. Localiza el JAR de temas en el contenedor:
   ```bash
   docker compose exec keycloak sh -c "ls /opt/keycloak/lib/lib/main/org.keycloak.keycloak-themes-*.jar"
   ```
2. Extrae `theme/keycloak.v2/login/login.ftl` (y `template.ftl` si hace falta).
3. Cópialos a `themes/sso-apps/login/login.ftl`.
4. En `theme.properties` ya tienes `parent=keycloak.v2` — tus archivos **sobrescriben** solo lo que copies.

> Mantén `parent=keycloak.v2` para no reimplementar toda la lógica OIDC.

---

## Consola de administración (barra superior)

`themes/sso-admin/admin/resources/css/admin.css` — colores del masthead.

Para cambios mayores en la UI admin, hace falta tema `admin` con plantillas propias (más complejo que el login).

---

## Producción

- Usa **HTTPS** y dominio propio (`auth.tuempresa.com`).
- Sube fuentes a tu CDN o inclúyelas en `resources/` (evita depender de Google Fonts en redes cerradas).
- Prueba en móvil: el CSS actual centra la tarjeta (`max-width: 420px`).
- Tras cambios en producción, puede hacer falta `start` (no `start-dev`) y limpiar caché del navegador.

---

## Checklist antes de publicar

- [ ] Logo y favicon (`resources/img/favicon.ico`)
- [ ] Colores alineados con manual de marca
- [ ] Textos en español revisados
- [ ] Enlaces del footer (`footer.ftl`) apuntan a URLs reales
- [ ] Login de admin (`sso-admin`) y de usuarios (`sso-apps`) se ven claramente distintos
- [ ] Probar flujo completo: login Node/PHP + consola admin
