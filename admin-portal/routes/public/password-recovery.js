const crypto = require('crypto');
const express = require('express');
const db = require('../../services/db');
const { kcRequest } = require('../../services/keycloak-admin');

const router = express.Router();
const REALM = process.env.KC_REALM || 'mobo';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const challenges = new Map();
const rateBuckets = new Map();

function maskEmail(value) {
    const email = String(value || '').trim();
    const at = email.lastIndexOf('@');
    if (at <= 0) return '';
    const local = email.slice(0, at);
    const domain = email.slice(at);
    if (local.length <= 2) return `${local.slice(0, 1)}****${domain}`;
    if (local.length <= 6) return `${local.slice(0, 2)}****${local.slice(-1)}${domain}`;
    return `${local.slice(0, 4)}****${local.slice(-2)}${domain}`;
}

function consumeRateLimit(req, action, limit) {
    const key = `${action}:${req.ip}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const current = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
    if (current.length >= limit) return false;
    current.push(now);
    rateBuckets.set(key, current);
    return true;
}

function pruneChallenges() {
    const now = Date.now();
    for (const [token, challenge] of challenges) {
        if (now - challenge.createdAt > CHALLENGE_TTL_MS) challenges.delete(token);
    }
}

router.post('/lookup', async (req, res) => {
    if (!consumeRateLimit(req, 'lookup', 10)) {
        return res.status(429).json({ error: 'Intenta nuevamente más tarde.' });
    }
    const username = String(req.body.user || '').trim();
    if (!username || username.length > 100) {
        return res.status(400).json({ error: 'Indica tu No. de empleado.' });
    }

    const user = await db.getUser(username);
    if (!user || !Number(user.enabled) || !String(user.email || '').includes('@')) {
        return res.status(404).json({
            error: 'No fue posible continuar. Contacta al administrador.',
        });
    }

    pruneChallenges();
    const challenge = crypto.randomBytes(32).toString('base64url');
    challenges.set(challenge, {
        username,
        email: String(user.email).trim().toLowerCase(),
        createdAt: Date.now(),
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ challenge, masked_email: maskEmail(user.email) });
});

router.post('/send', async (req, res) => {
    const genericMessage = 'Si el correo que colocaste coincide, se te enviará un correo.';
    if (!consumeRateLimit(req, 'send', 5)) {
        return res.status(202).json({ message: genericMessage });
    }

    pruneChallenges();
    const token = String(req.body.challenge || '');
    const suppliedEmail = String(req.body.email || '').trim().toLowerCase();
    const challenge = challenges.get(token);
    challenges.delete(token);

    const suppliedHash = crypto.createHash('sha256').update(suppliedEmail).digest();
    const expectedHash = crypto.createHash('sha256').update(challenge?.email || '').digest();
    if (challenge && suppliedEmail && crypto.timingSafeEqual(suppliedHash, expectedHash)) {
        try {
            const users = await kcRequest(
                'GET',
                `/realms/${REALM}/users?username=${encodeURIComponent(challenge.username)}&exact=true`
            );
            const keycloakUser = users?.[0];
            if (keycloakUser?.id) {
                const clientId = String(req.body.client_id || '').trim();
                const clientQuery = clientId ? `?client_id=${encodeURIComponent(clientId)}&lifespan=900` : '?lifespan=900';
                await kcRequest(
                    'PUT',
                    `/realms/${REALM}/users/${keycloakUser.id}/execute-actions-email${clientQuery}`,
                    ['UPDATE_PASSWORD']
                );
            }
        } catch (error) {
            console.error('No se pudo enviar recuperación de contraseña:', error.message);
        }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    res.set('Cache-Control', 'no-store');
    return res.status(202).json({ message: genericMessage });
});

module.exports = router;
module.exports.maskEmail = maskEmail;
