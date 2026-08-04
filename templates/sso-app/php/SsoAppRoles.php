<?php
/**
 * Roles internos de aplicación (client roles Keycloak, excepto "access").
 * Copiar a core/SsoAppRoles.php en cada sistema PHP conectado al SSO.
 */
class SsoAppRoles
{
    public const ACCESS_ROLE = 'access';

    /** Prioridad para elegir rol principal cuando hay varios */
    private static $defaultPriority = ['admin', 'usuario', 'consulta'];

    public static function internalRoles(array $clientRoles): array
    {
        return array_values(array_filter(
            $clientRoles,
            static fn($role) => $role !== self::ACCESS_ROLE
        ));
    }

    public static function primaryRole(array $clientRoles, ?array $priority = null): ?string
    {
        $internal = self::internalRoles($clientRoles);
        if (!$internal) {
            return null;
        }
        $order = $priority ?? self::$defaultPriority;
        foreach ($order as $code) {
            if (in_array($code, $internal, true)) {
                return $code;
            }
        }
        return $internal[0];
    }

    public static function hasRole(array $clientRoles, string $codigo): bool
    {
        return in_array($codigo, $clientRoles, true);
    }

    public static function hasAnyRole(array $clientRoles, array $codigos): bool
    {
        foreach ($codigos as $codigo) {
            if (self::hasRole($clientRoles, $codigo)) {
                return true;
            }
        }
        return false;
    }

    public static function label(string $codigo): string
    {
        $labels = [
            'admin'    => 'Administrador',
            'usuario'  => 'Usuario',
            'consulta' => 'Consulta',
        ];
        return $labels[$codigo] ?? ucfirst($codigo);
    }
}
