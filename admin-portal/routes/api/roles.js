const express = require('express');
const db = require('../../services/db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const roles = await db.listRoles();
        res.json(roles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
