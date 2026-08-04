<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MOBO SSO</title>
</head>
<body bgcolor="#eef2f7" style="margin:0;padding:0;background-color:#eef2f7;">

<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#eef2f7">
<tr>
<td align="center" style="padding:40px 16px;">

<table width="520" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:520px;width:100%;">

    <!-- Cabecera -->
    <tr>
        <td align="center" bgcolor="#0c0c0c" style="background-color:#0c0c0c;padding:32px 28px 28px 28px;">
            <font color="#FFFFFF" face="Arial,Helvetica,sans-serif" size="6"><b>MOBO</b></font>
            <br/><br/>
            <font color="#a1a1aa" face="Arial,Helvetica,sans-serif" size="2">Tu acceso a las aplicaciones</font>
        </td>
    </tr>

    <!-- Saludo -->
    <tr>
        <td align="center" style="padding:36px 36px 8px 36px;">
            <font color="#0c0c0c" face="Arial,Helvetica,sans-serif" size="4">
                <b>¡Hola<#if user.username??>, ${user.username}</#if>!</b>
            </font>
            <br/><br/>
            <font color="#475569" face="Arial,Helvetica,sans-serif" size="3" style="line-height:1.6;">
                Recibimos una solicitud para restablecer tu contraseña.<br/>
                Es rápido y solo toma un minuto.
            </font>
        </td>
    </tr>

    <!-- Botón principal -->
    <tr>
        <td align="center" style="padding:24px 36px 8px 36px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td align="center" bgcolor="#0c0c0c" style="background-color:#0c0c0c;border-radius:999px;">
                        <a href="${link}" target="_blank" style="display:block;padding:18px 32px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;text-align:center;">
                            <font color="#FFFFFF"><b>Crear nueva contraseña</b></font>
                        </a>
                    </td>
                </tr>
            </table>
        </td>
    </tr>

    <!-- Nota de tiempo -->
    <tr>
        <td align="center" style="padding:16px 36px 8px 36px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td align="center" bgcolor="#f4f4f5" style="background-color:#f4f4f5;padding:14px 18px;border-radius:8px;">
                        <font color="#0c0c0c" face="Arial,Helvetica,sans-serif" size="2">
                            Este enlace estará disponible por <b>${linkExpirationFormatter(linkExpiration)}</b>
                        </font>
                    </td>
                </tr>
            </table>
        </td>
    </tr>

    <!-- Mensaje de tranquilidad -->
    <tr>
        <td align="center" style="padding:20px 36px 32px 36px;">
            <font color="#64748b" face="Arial,Helvetica,sans-serif" size="2" style="line-height:1.7;">
                Si tú no hiciste esta solicitud, no te preocupes:<br/>
                puedes ignorar este correo y tu contraseña seguirá igual.
            </font>
            <br/><br/>
            <font color="#94a3b8" face="Arial,Helvetica,sans-serif" size="2">
                ¿Problemas con el botón? Copia este enlace en tu navegador:<br/>
                <a href="${link}" style="color:#0c0c0c;word-break:break-all;"><font color="#0c0c0c">${link}</font></a>
            </font>
        </td>
    </tr>

    <!-- Pie -->
    <tr>
        <td align="center" bgcolor="#f8fafc" style="background-color:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
            <font color="#94a3b8" face="Arial,Helvetica,sans-serif" size="2">
                ${realmName} &middot; MOBO SSO<br/>
                Con cariño, el equipo de Mobonet
            </font>
        </td>
    </tr>

</table>

</td>
</tr>
</table>

</body>
</html>
