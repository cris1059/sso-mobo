<#import "template.ftl" as layout>
<@layout.registrationLayout displayRequiredFields=false displayMessage=!messagesPerField.existsError('totp','userLabel'); section>
    <#if section = "header">
        ${msg("loginTotpTitle")}
    <#elseif section = "form">
        <form action="${url.loginAction}" class="${properties.kcFormClass!}" id="kc-totp-settings-form" method="post">
            <div class="totp-container-2col">
                <!-- Left Column: QR Code & Manual Key Link -->
                <div class="totp-left-col">
                    <div class="qr-wrapper">
                        <img id="kc-totp-secret-qr-code" src="data:image/png;base64,${totp.totpSecretQrCode}" alt="Código QR 2FA" />
                    </div>
                    <#if mode?? && mode == "manual">
                        <div class="totp-manual-secret">
                            <span class="totp-manual-label">${msg("loginTotpManualStep2")}</span>
                            <code class="totp-secret-key">${totp.totpSecretEncoded}</code>
                        </div>
                    <#else>
                        <div class="totp-manual-link">
                            <a href="${totp.manualUrl}" id="mode-manual">${msg("loginTotpUnableToScan")}</a>
                        </div>
                    </#if>
                </div>

                <!-- Right Column: Instructions & Form Inputs -->
                <div class="totp-right-col">
                    <div class="totp-step">
                        <p class="totp-step-desc">${msg("loginTotpStep1")}</p>
                    </div>

                    <div class="totp-form-group">
                        <label for="totp" class="totp-label">${msg("loginTotpOneTime")} <span class="required">*</span></label>
                        <input type="text" id="otp" name="totp" class="totp-input" autocomplete="off" autofocus aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>" placeholder="123456" />
                        <#if messagesPerField.existsError('totp')>
                            <span id="input-error-otp" class="totp-error" aria-live="polite">
                                ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                            </span>
                        </#if>
                    </div>

                    <div class="totp-form-group">
                        <label for="userLabel" class="totp-label">${msg("loginTotpDeviceName")}</label>
                        <input type="text" id="userLabel" name="userLabel" class="totp-input" autocomplete="off" placeholder="Ej. Mi Teléfono" />
                    </div>

                    <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
                    <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>

                    <div class="totp-actions">
                        <input class="totp-submit-btn" id="saveTOTPBtn" type="submit" value="${msg("doSubmit")}"/>
                    </div>
                </div>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
