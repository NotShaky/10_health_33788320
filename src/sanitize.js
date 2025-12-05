function sanitizeText(input, { maxLen = 500 } = {}) {
  if (typeof input !== 'string') return '';
  let s = input.trim();
  s = s.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  s = s.replace(/on[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/on[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/javascript:\s*/gi, '');
  s = s.replace(/[<>]/g, '');
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

module.exports = { sanitizeText };
