<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        Recuperar contraseña
    <#elseif section = "form">
        <div id="mobo-recovery">
            <div id="mobo-recovery-search">
                <p>Primero busca tu cuenta con tu No. de empleado.</p>
                <div class="${properties.kcFormGroupClass!}">
                    <label for="recovery-user" class="${properties.kcLabelClass!}">No. de empleado</label>
                    <input id="recovery-user" class="${properties.kcInputClass!}" type="text"
                           inputmode="numeric" autocomplete="username" autofocus>
                </div>
                <button id="recovery-search-button" type="button"
                        class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}">
                    Buscar
                </button>
            </div>

            <div id="mobo-recovery-confirm" class="mobo-hidden">
                <p>Correo registrado:</p>
                <p id="recovery-masked-email" class="mobo-masked-email"></p>
                <div class="${properties.kcFormGroupClass!}">
                    <label for="recovery-email" class="${properties.kcLabelClass!}">Escribe tu correo completo</label>
                    <input id="recovery-email" class="${properties.kcInputClass!}" type="email"
                           autocomplete="email">
                </div>
                <button id="recovery-send-button" type="button"
                        class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}">
                    Enviar
                </button>
            </div>

            <div id="mobo-recovery-result" class="mobo-hidden" role="status"></div>
            <p id="mobo-recovery-error" class="mobo-recovery-error mobo-hidden" role="alert"></p>
            <p class="mobo-recovery-help">¿No recuerdas tu correo o quieres cambiarlo? Contacta al administrador.</p>
            <p class="mobo-recovery-back"><a href="${url.loginUrl}">Volver al inicio de sesión</a></p>
        </div>

        <script>
        (function () {
          var search = document.getElementById('mobo-recovery-search');
          var confirmBox = document.getElementById('mobo-recovery-confirm');
          var result = document.getElementById('mobo-recovery-result');
          var error = document.getElementById('mobo-recovery-error');
          var userInput = document.getElementById('recovery-user');
          var emailInput = document.getElementById('recovery-email');
          var challenge = '';
          var clientId = '${((client.clientId)!"")?js_string}';
          var apiBase = '/admin/api/public/password-recovery';

          function showError(text) {
            error.textContent = text;
            error.classList.remove('mobo-hidden');
          }

          document.getElementById('recovery-search-button').addEventListener('click', async function () {
            error.classList.add('mobo-hidden');
            var user = userInput.value.trim();
            if (!user) return showError('Indica tu No. de empleado.');
            this.disabled = true;
            try {
              var response = await fetch(apiBase + '/lookup', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({user: user})
              });
              var data = await response.json();
              if (!response.ok) throw new Error(data.error || 'No fue posible continuar.');
              challenge = data.challenge;
              document.getElementById('recovery-masked-email').textContent = data.masked_email;
              search.classList.add('mobo-hidden');
              confirmBox.classList.remove('mobo-hidden');
              emailInput.focus();
            } catch (e) {
              showError(e.message);
            } finally {
              this.disabled = false;
            }
          });

          document.getElementById('recovery-send-button').addEventListener('click', async function () {
            error.classList.add('mobo-hidden');
            var email = emailInput.value.trim();
            if (!email) return showError('Escribe tu correo completo.');
            this.disabled = true;
            try {
              var response = await fetch(apiBase + '/send', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({challenge: challenge, email: email, client_id: clientId})
              });
              var data = await response.json();
              confirmBox.classList.add('mobo-hidden');
              result.textContent = data.message || 'Si el correo que colocaste coincide, se te enviará un correo.';
              result.classList.remove('mobo-hidden');
            } catch (e) {
              confirmBox.classList.add('mobo-hidden');
              result.textContent = 'Si el correo que colocaste coincide, se te enviará un correo.';
              result.classList.remove('mobo-hidden');
            } finally {
              this.disabled = false;
            }
          });
        })();
        </script>
    </#if>
</@layout.registrationLayout>
