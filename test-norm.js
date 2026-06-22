function normalizeRef(num) {
  return String(num || "").toLowerCase().replace(/\s/g, '').replace(/(^|\D)0+/g, '$1');
}

console.log('00123 ->', normalizeRef('00123'));
console.log('PR00123 ->', normalizeRef('PR00123'));
console.log('123 ->', normalizeRef('123'));
console.log('PR123 ->', normalizeRef('PR123'));
console.log('PR 123 ->', normalizeRef('PR 123'));
console.log('0 ->', normalizeRef('0'));
console.log('000 ->', normalizeRef('000'));
