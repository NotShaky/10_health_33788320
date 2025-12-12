const express = require('express');
const router = express.Router();
const audit = require('../src/audit');
const { sanitizeText } = require('../src/sanitize');
const https = require('https');

router.get('/tools', (req, res) => {
  audit.log(req, 'view_tools');
  res.render('tools', { user: req.session.user || null });
});

router.get('/tools/bmi', (req, res) => {
  audit.log(req, 'view_bmi');
  res.render('bmi', { user: req.session.user || null, result: null, error: null, height: '', weight: '', unit: 'metric' });
});

router.post('/tools/bmi', (req, res) => {
  try {
    const heightStr = sanitizeText(req.body.height || '', { maxLen: 10 });
    const weightStr = sanitizeText(req.body.weight || '', { maxLen: 10 });
    const unit = sanitizeText(req.body.unit || 'metric', { maxLen: 10 }).toLowerCase();
    let h = parseFloat(heightStr);
    let w = parseFloat(weightStr);
    if (Number.isNaN(h) || Number.isNaN(w) || h <= 0 || w <= 0) {
      audit.log(req, 'bmi_calc_failed', { height: heightStr, weight: weightStr });
      const errMsg = unit === 'imperial' ? 'Please enter valid positive numbers for height (in) and weight (lb).' : 'Please enter valid positive numbers for height (m) and weight (kg).';
      return res.status(400).render('bmi', { user: req.session.user || null, result: null, error: errMsg, height: heightStr, weight: weightStr, unit });
    }
    if (unit === 'imperial') { h = h * 0.0254; w = w * 0.45359237; }
    const bmi = w / (h * h);
    let category = 'Normal';
    if (bmi < 18.5) category = 'Underweight';
    else if (bmi < 25) category = 'Normal';
    else if (bmi < 30) category = 'Overweight';
    else category = 'Obese';
    const result = { bmi: Number(bmi.toFixed(2)), category };
    audit.log(req, 'bmi_calc_success', { bmi: result.bmi, category });
    res.render('bmi', { user: req.session.user || null, result, error: null, height: heightStr, weight: weightStr, unit });
  } catch (err) {
    console.error('BMI error:', err.message);
    audit.log(req, 'bmi_calc_error', { error: err.message });
    res.status(500).render('bmi', { user: req.session.user || null, result: null, error: 'Server error. Please try again.', height: '', weight: '', unit: 'metric' });
  }
});

router.get('/tools/bmr', (req, res) => {
  audit.log(req, 'view_bmr');
  res.render('bmr', { user: req.session.user || null, result: null, error: null, form: { sex: 'male', age: '', height: '', weight: '', activity: 'moderate' } });
});

router.post('/tools/bmr', (req, res) => {
  try {
    const sex = sanitizeText(req.body.sex || 'male', { maxLen: 10 }).toLowerCase();
    const age = parseInt((req.body.age || '').trim(), 10);
    const height = parseFloat((req.body.height || '').trim());
    const weight = parseFloat((req.body.weight || '').trim());
    const activity = sanitizeText(req.body.activity || 'moderate', { maxLen: 20 }).toLowerCase();
    if (!['male','female'].includes(sex) || Number.isNaN(age) || Number.isNaN(height) || Number.isNaN(weight) || age <= 0 || height <= 0 || weight <= 0) {
      audit.log(req, 'bmr_failed');
      return res.status(400).render('bmr', { user: req.session.user || null, result: null, error: 'Please enter valid values.', form: { sex, age: req.body.age || '', height: req.body.height || '', weight: req.body.weight || '', activity } });
    }
    const hCm = height;
    const bmr = sex === 'male' ? (10 * weight + 6.25 * hCm - 5 * age + 5) : (10 * weight + 6.25 * hCm - 5 * age - 161);
    const factors = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
    const factor = factors[activity] || factors.moderate;
    const tdee = Math.round(bmr * factor);
    const result = { bmr: Math.round(bmr), tdee, activity };
    audit.log(req, 'bmr_success', result);
    res.render('bmr', { user: req.session.user || null, result, error: null, form: { sex, age, height: hCm, weight, activity } });
  } catch (err) {
    console.error('BMR error:', err.message);
    audit.log(req, 'bmr_error', { error: err.message });
    res.status(500).render('bmr', { user: req.session.user || null, result: null, error: 'Server error.', form: { sex: 'male', age: '', height: '', weight: '', activity: 'moderate' } });
  }
});

router.get('/tools/hr', (req, res) => {
  audit.log(req, 'view_hr');
  res.render('hr', { user: req.session.user || null, result: null, error: null, age: '' });
});

router.post('/tools/hr', (req, res) => {
  const age = parseInt((req.body.age || '').trim(), 10);
  if (Number.isNaN(age) || age <= 0) {
    audit.log(req, 'hr_failed');
    return res.status(400).render('hr', { user: req.session.user || null, result: null, error: 'Please enter a valid age.', age: req.body.age || '' });
  }
  const max = 220 - age;
  const zones = [
    { name: 'Zone 1 (50–60%)', min: Math.round(max * 0.5), max: Math.round(max * 0.6) },
    { name: 'Zone 2 (60–70%)', min: Math.round(max * 0.6), max: Math.round(max * 0.7) },
    { name: 'Zone 3 (70–80%)', min: Math.round(max * 0.7), max: Math.round(max * 0.8) },
    { name: 'Zone 4 (80–90%)', min: Math.round(max * 0.8), max: Math.round(max * 0.9) },
    { name: 'Zone 5 (90–100%)', min: Math.round(max * 0.9), max: Math.round(max * 1.0) },
  ];
  audit.log(req, 'hr_success', { max });
  res.render('hr', { user: req.session.user || null, result: { max, zones }, error: null, age });
});

router.get('/tools/macros', (req, res) => {
  audit.log(req, 'view_macros');
  res.render('macros', { user: req.session.user || null, result: null, error: null, form: { calories: '', goal: 'maintain' } });
});

router.post('/tools/macros', (req, res) => {
  const calories = parseInt((req.body.calories || '').trim(), 10);
  const goal = (req.body.goal || 'maintain').toLowerCase();
  if (Number.isNaN(calories) || calories <= 0) {
    audit.log(req, 'macros_failed');
    return res.status(400).render('macros', { user: req.session.user || null, result: null, error: 'Enter valid daily calories.', form: { calories: req.body.calories || '', goal } });
  }
  const adj = goal === 'cut' ? -0.15 : goal === 'bulk' ? 0.15 : 0;
  const target = Math.round(calories * (1 + adj));
  const proteinCals = Math.round(target * 0.30), carbsCals = Math.round(target * 0.40), fatCals = Math.round(target * 0.30);
  const result = {
    calories: target,
    protein_g: Math.round(proteinCals / 4),
    carbs_g: Math.round(carbsCals / 4),
    fat_g: Math.round(fatCals / 9)
  };
  audit.log(req, 'macros_success', result);
  res.render('macros', { user: req.session.user || null, result, error: null, form: { calories, goal } });
});

router.get('/tools/water', (req, res) => {
  audit.log(req, 'view_water');
  res.render('water', { user: req.session.user || null, result: null, error: null, form: { weight: '', unit: 'metric', activity: 'moderate', climate: 'temperate' } });
});

router.post('/tools/water', (req, res) => {
  try {
    const unit = (req.body.unit || 'metric').trim();
    const weightStr = (req.body.weight || '').trim();
    const activity = (req.body.activity || 'moderate').trim();
    const climate = (req.body.climate || 'temperate').trim();

    const weightNum = parseFloat(weightStr);
    if (Number.isNaN(weightNum) || weightNum <= 0) {
      audit.log(req, 'water_failed');
      return res.status(400).render('water', { user: req.session.user || null, result: null, error: 'Enter a valid weight.', form: { weight: weightStr, unit, activity, climate } });
    }

    const weightKg = unit === 'imperial' ? weightNum * 0.45359237 : weightNum;
    let ml = weightKg * 35;
    const activityAdd = { sedentary: 0, light: 300, moderate: 700, active: 1200, very: 1800 }[activity] ?? 700;
    ml += activityAdd;
    const climateAdd = { temperate: 0, warm: 400, hot: 900 }[climate] ?? 0;
    ml += climateAdd;
    ml = Math.max(1500, Math.min(6000, Math.round(ml)));
    const liters = (ml / 1000).toFixed(2);
    const cups = (ml / 240).toFixed(1);
    audit.log(req, 'water_success', { unit, weight: weightNum, activity, climate, ml });
    return res.render('water', { user: req.session.user || null, result: { ml, liters, cups }, error: null, form: { weight: weightStr, unit, activity, climate } });
  } catch (err) {
    console.error('Water calc error:', err);
    audit.log(req, 'water_error', { error: err.message });
    return res.status(500).render('water', { user: req.session.user || null, result: null, error: 'Something went wrong. Try again.', form: { weight: (req.body.weight||'').trim(), unit: (req.body.unit||'metric').trim(), activity: (req.body.activity||'moderate').trim(), climate: (req.body.climate||'temperate').trim() } });
  }
});

// Nutrition (CalorieNinjas)
const CALORIE_NINJAS_KEY = "iXRzvGVsFukMEPsyl0bu3A==N8zHx6duqJ6gQIOZ";
async function fetchCalorieNinjas(pathname, qs) {
  return new Promise((resolve, reject) => {
    const key = (CALORIE_NINJAS_KEY || '').trim();
    if (!key) return reject(new Error('Missing CalorieNinjas API key'));
    const query = new URLSearchParams(qs || {}).toString();
    const options = {
      hostname: 'api.calorieninjas.com',
      path: `${pathname}?${query}`,
      method: 'GET',
      headers: { 'X-Api-Key': key }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

router.get('/tools/nutrition', (req, res) => {
  audit.log(req, 'view_nutrition');
  res.render('nutrition', { user: req.session.user || null, error: null, items: [], q: '' });
});

router.post('/tools/nutrition', async (req, res) => {
  const q = sanitizeText(req.body.q || '', { maxLen: 100 });
  if (!q) {
    audit.log(req, 'nutrition_failed', { reason: 'empty' });
    return res.status(400).render('nutrition', { user: req.session.user || null, error: 'Enter a food name, e.g., "apple"', items: [], q });
  }
  try {
    const result = await fetchCalorieNinjas('/v1/nutrition', { query: q });
    const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];
    audit.log(req, 'nutrition_success', { q, count: items.length });
    res.render('nutrition', { user: req.session.user || null, error: null, items, q });
  } catch (err) {
    console.error('Nutrition API error:', err.message);
    audit.log(req, 'nutrition_error', { error: err.message });
    res.status(500).render('nutrition', { user: req.session.user || null, error: 'Failed to fetch nutrition data.', items: [], q });
  }
});

module.exports = router;
