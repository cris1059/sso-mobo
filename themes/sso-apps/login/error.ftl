<#import "template.ftl" as layout>
<#assign summary = (message.summary!"")?lower_case>
<#assign isAccessDenied = summary?contains("access denied") || summary?contains("acceso denegado")>
<#assign realmBase = url.loginUrl?keep_before("/login-actions/")>

<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if isAccessDenied>¡Oh, oh!<#else>${msg("errorTitle")}</#if>
    <#elseif section = "form">
        <div class="mobo-error-state">
            <div class="mobo-error-icon" aria-hidden="true">!</div>
            <#if isAccessDenied>
                <h1>No tienes acceso a este sistema</h1>
                <p class="mobo-error-help">Contacta al administrador del sistema para solicitar acceso.</p>
                <#assign appHome = (client.baseUrl)!"/">
                <a id="mobo-error-back" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                   href="${appHome}" onclick="if (window.history.length > 1) { window.history.back(); return false; }">
                    Volver
                </a>
            <#else>
                <p>${kcSanitize(message.summary)?no_esc}</p>
                <#if client?? && client.baseUrl?has_content>
                    <a class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                       href="${client.baseUrl}">${msg("backToApplication")}</a>
                </#if>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
