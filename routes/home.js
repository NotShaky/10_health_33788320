const express = require('express');
const router = express.Router();
const audit = require('../src/audit');

router.get('/', async (req, res) => {
  audit.log(req, 'view_home');
  res.render('home', { user: req.session.user || null });
});

router.get('/about', (req, res) => {
  audit.log(req, 'view_about');
  res.render('about', { user: req.session.user || null });
});

module.exports = router;
