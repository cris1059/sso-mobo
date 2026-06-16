# Personalizar el login tú mismo

## Archivos (realm mobo / sistemas)

| Qué quieres cambiar | Archivo |
|---------------------|---------|
| **Ancho, colores, bordes, logo** | `sso-apps/login/resources/css/custom.css` → bloque `:root` al inicio |
| **Cualquier CSS extra** | `sso-apps/login/resources/css/mis-estilos.css` (vacío, solo tú) |
| **Textos** (título, botón) | `sso-apps/login/messages/messages_es.properties` |
| **Imagen logo** | `sso-apps/login/resources/img/logo.png` |

## Variables rápidas (`custom.css`)

```css
:root {
  --fondo-pagina: #1f1f1f;   /* fondo pantalla */
  --fondo-caja: #707070;      /* recuadro login */
  --caja-ancho: 520px;        /* ancho del recuadro ← cambia esto */
  --caja-radio: 15px;
  --input-radio: 15px;
}
```

## Por qué a veces "no se ve el cambio"

1. **Caché del navegador** → Ctrl+Shift+R o ventana de incógnito.
2. **Keycloak** → `docker compose restart keycloak` (en la carpeta del proyecto).
3. **Tema incorrecto** → Admin http://localhost:8080/admin → Realm **mobo** → **Realm settings** → **Themes** → **Login theme** = `sso-apps` → Save.
4. **Editaste otro archivo** → Solo cuenta `themes/sso-apps/login/resources/css/custom.css` y `mis-estilos.css`.
5. **Comprueba que carga tu CSS** → En el login, F12 → pestaña Red → busca `custom.css` → debe abrirse y verse tu `--caja-ancho`.

## Probar ancho al instante (F12)

En la consola del navegador, en la página de login:

```javascript
document.querySelector('.pf-v5-c-login__main').style.maxWidth = '600px'
```

Si ahí sí cambia, el problema es caché o tema; si no cambia, el selector del recuadro es otro (avisa y lo ajustamos).

## Admin (`/admin`)

Tema aparte: `sso-admin/login/resources/css/custom.css`
