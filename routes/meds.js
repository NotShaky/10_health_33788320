const express = require('express');
const router = express.Router();
const db = require('../src/db');
const audit = require('../src/audit');
const { sanitizeText } = require('../src/sanitize');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  const bpAuth = res.locals.basePath || '';
  const dest = `${bpAuth}/login`;
  const abs = `${req.protocol}://${req.get('host')}${dest}`;
  return res.redirect(abs);
}

router.get('/meds', requireAuth, async (req, res) => {
  audit.log(req, 'view_meds');
  try {
    const userId = req.session.user.id;
    const [rows] = await db.query(
      'SELECT id, name, dosage, interval_hours, freq_type, time_of_day, days_of_week, notes, created_at FROM medications WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    const weekdayIndex = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const schedules = rows.map(m => {
      const now = new Date();
      let times = [];
      let nextDue = null;
      if (m.freq_type === 'interval') {
        const interval = m.interval_hours;
        for (let t = interval; t <= 24; t += interval) {
          const d = new Date(now);
          d.setHours(now.getHours() + t, 0, 0, 0);
          times.push(d);
        }
        nextDue = times[0] || null;
      } else if (m.freq_type === 'daily') {
        const [hh, mm] = (m.time_of_day || '08:00').split(':').map(x => parseInt(x,10));
        const todayDose = new Date(now);
        todayDose.setHours(hh||8, mm||0, 0, 0);
        if (todayDose > now) { times.push(todayDose); }
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowDose = new Date(tomorrow);
        tomorrowDose.setHours(hh||8, mm||0, 0, 0);
        times.push(tomorrowDose);
        nextDue = times[0] || null;
      } else if (m.freq_type === 'weekly') {
        const [hh, mm] = (m.time_of_day || '08:00').split(':').map(x => parseInt(x,10));
        const days = (m.days_of_week || 'Mon,Thu').split(',').map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < 14; i++) {
          const d = new Date(now);
          d.setDate(now.getDate() + i);
          const dayName = Object.keys(weekdayIndex)[d.getDay()];
          if (days.includes(dayName)) {
            d.setHours(hh||8, mm||0, 0, 0);
            if (d > now) times.push(d);
          }
        }
        times = times.slice(0, 4);
        nextDue = times[0] || null;
      }
      return { ...m, schedule: times, nextDue };
    });
    res.render('meds', { user: req.session.user || null, meds: schedules, error: null, form: { name: '', dosage: '', interval_hours: '', freq_type: 'interval', time_of_day: '08:00', days_of_week: 'Mon,Thu', notes: '' } });
  } catch (err) {
    console.error('Meds view error:', err);
    res.status(500).render('meds', { user: req.session.user || null, meds: [], error: 'Unable to load medications.', form: { name: '', dosage: '', interval_hours: '', freq_type: 'interval', time_of_day: '08:00', days_of_week: 'Mon,Thu', notes: '' } });
  }
});

router.post('/meds', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const name = sanitizeText(req.body.name || '', { maxLen: 100 });
    const dosage = sanitizeText(req.body.dosage || '', { maxLen: 100 });
    const notes = sanitizeText(req.body.notes || '', { maxLen: 500 });
    const freqType = sanitizeText(req.body.freq_type || 'interval', { maxLen: 10 }).toLowerCase();
    const intervalHours = parseInt((req.body.interval_hours || '').trim(), 10);
    const timeOfDay = sanitizeText(req.body.time_of_day || '08:00', { maxLen: 5 });
    const daysOfWeek = sanitizeText(req.body.days_of_week || 'Mon,Thu', { maxLen: 50 });
    if (!name) {
      return res.status(400).render('meds', { user: req.session.user || null, meds: [], error: 'Medication name is required.', form: { name, dosage, interval_hours: req.body.interval_hours || '', freq_type: freqType, time_of_day: timeOfDay, days_of_week: daysOfWeek, notes } });
    }
    if (freqType === 'interval') {
      if (Number.isNaN(intervalHours) || intervalHours <= 0 || intervalHours > 48) {
        return res.status(400).render('meds', { user: req.session.user || null, meds: [], error: 'Interval must be a number between 1 and 48 hours.', form: { name, dosage, interval_hours: req.body.interval_hours || '', freq_type: freqType, time_of_day: timeOfDay, days_of_week: daysOfWeek, notes } });
      }
    } else if (freqType === 'daily') {
      if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
        return res.status(400).render('meds', { user: req.session.user || null, meds: [], error: 'Time of day must be HH:MM.', form: { name, dosage, interval_hours: '', freq_type: freqType, time_of_day: timeOfDay, days_of_week: '', notes } });
      }
    } else if (freqType === 'weekly') {
      if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
        return res.status(400).render('meds', { user: req.session.user || null, meds: [], error: 'Time of day must be HH:MM.', form: { name, dosage, interval_hours: '', freq_type: freqType, time_of_day: timeOfDay, days_of_week: daysOfWeek, notes } });
      }
      const aliasMap = {
        'sun': 'Sun', 'sunday': 'Sun',
        'mon': 'Mon', 'monday': 'Mon',
        'tue': 'Tue', 'tues': 'Tue', 'tuesday': 'Tue',
        'wed': 'Wed', 'wednesday': 'Wed',
        'thu': 'Thu', 'thur': 'Thu', 'thurs': 'Thu', 'thursday': 'Thu',
        'fri': 'Fri', 'friday': 'Fri',
        'sat': 'Sat', 'saturday': 'Sat'
      };
      const rawDays = daysOfWeek.split(',').map(s => s.trim()).filter(Boolean);
      const normalizedDays = rawDays.map(d => aliasMap[d.toLowerCase()] || null).filter(Boolean);
      const uniqueDays = Array.from(new Set(normalizedDays));
      if (!uniqueDays.length) {
        return res.status(400).render('meds', { user: req.session.user || null, meds: [], error: 'Days must be comma-separated names like Mon,Thu (case-insensitive; full names allowed).', form: { name, dosage, interval_hours: '', freq_type: freqType, time_of_day: timeOfDay, days_of_week: daysOfWeek, notes } });
      }
      req.body.days_of_week = uniqueDays.join(',');
    } else {
      return res.status(400).render('meds', { user: req.session.user || null, meds: [], error: 'Invalid frequency type.', form: { name, dosage, interval_hours: req.body.interval_hours || '', freq_type: freqType, time_of_day: timeOfDay, days_of_week: daysOfWeek, notes } });
    }
    await db.query(
      'INSERT INTO medications (user_id, name, dosage, interval_hours, freq_type, time_of_day, days_of_week, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, name, dosage || null, freqType==='interval'? intervalHours : null, freqType, freqType!=='interval'? timeOfDay : null, freqType==='weekly'? req.body.days_of_week : null, notes || null]
    );
    audit.log(req, 'add_medication', { name, intervalHours });
    const bpMeds = res.locals.basePath || '';
    const dest = `${bpMeds}/meds`;
    const abs = `${req.protocol}://${req.get('host')}${dest}`;
    res.redirect(abs);
  } catch (err) {
    console.error('Add med error:', err);
    res.status(500).render('meds', { user: req.session.user || null, meds: [], error: 'Server error. Please try again.', form: { name: sanitizeText(req.body.name||'',{maxLen:100}), dosage: sanitizeText(req.body.dosage||'',{maxLen:100}), interval_hours: (req.body.interval_hours||''), freq_type: sanitizeText(req.body.freq_type||'interval',{maxLen:10}), time_of_day: sanitizeText(req.body.time_of_day||'',{maxLen:5}), days_of_week: sanitizeText(req.body.days_of_week||'',{maxLen:50}), notes: sanitizeText(req.body.notes||'',{maxLen:500}) } });
  }
});

module.exports = router;
