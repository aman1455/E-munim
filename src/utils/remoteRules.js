// ============================================================================
// Remote Statutory Rules & Compliance Synchronization
// ----------------------------------------------------------------------------
// Manages dynamic tax overrides, HSN rate revisions, TDS/TCS rules, and
// compliance notices fetched from the Vercel remote hub (or local API cache).
//
// Complies with the Temporal Rule Mandate: past rates remain tied to their
// effective date range so historical invoices reprint accurately without drift.
// ============================================================================

const STORAGE_KEY = 'gst_remote_rules';
export const DEFAULT_HUB_URL = 'https://license-genrator.vercel.app/api/sync';

function getStorageItem(key) {
  if (typeof localStorage !== 'undefined') {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return null;
}

function setStorageItem(key, val) {
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(key, val); } catch {}
  }
}

// In-memory active rules cache
let memoryRules = null;

export function parseDateOnly(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

/**
 * Returns current rules in memory or loads from localStorage.
 */
export function getActiveRules() {
  if (memoryRules) return memoryRules;

  const raw = getStorageItem(STORAGE_KEY);
  if (raw) {
    try {
      memoryRules = JSON.parse(raw);
      return memoryRules;
    } catch {
      // ignore parse error
    }
  }

  return null;
}

/**
 * Manually update active rules in memory and localStorage.
 */
export function setActiveRules(rules) {
  if (!rules || typeof rules !== 'object') return;
  memoryRules = rules;
  setStorageItem(STORAGE_KEY, JSON.stringify(rules));

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('gst-remote-rules-updated', { detail: rules }));
    } catch {}
  }
}

/**
 * Resolves any temporal HSN/SAC rate overrides for a given code and invoice date.
 * If queryDate is not provided, defaults to current date.
 *
 * @param {string} hsnOrSac - The HSN or SAC code (e.g. '9503', '4809', '3101')
 * @param {string|Date} [queryDateInput] - Invoice date (YYYY-MM-DD)
 * @returns {object|null} - Matching rule { rate, rates, label, condition, reference } or null
 */
export function resolveHsnOverride(hsnOrSac, queryDateInput = null) {
  if (!hsnOrSac) return null;
  const clean = String(hsnOrSac).replace(/\s+/g, '');
  if (!/^\d{4,8}$/.test(clean)) return null;

  const rules = getActiveRules();
  const overrides = rules?.hsnDateOverrides;
  if (!overrides || typeof overrides !== 'object') return null;

  const targetDateStr = queryDateInput
    ? (typeof queryDateInput === 'string' ? queryDateInput.slice(0, 10) : queryDateInput.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  const qDate = parseDateOnly(targetDateStr);
  if (!qDate || isNaN(qDate.getTime())) return null;

  // Look for exact match or longest prefix (from clean.length down to 4 digits)
  for (let len = clean.length; len >= 4; len--) {
    const prefix = clean.slice(0, len);
    const candidateList = overrides[prefix];
    if (Array.isArray(candidateList) && candidateList.length > 0) {
      for (const rule of candidateList) {
        const from = rule.effectiveFrom ? parseDateOnly(rule.effectiveFrom) : null;
        const to = rule.effectiveTo ? parseDateOnly(rule.effectiveTo) : null;

        if (from && qDate < from) continue;
        if (to && qDate > to) continue;

        // Found matching temporal rule
        return {
          rate: typeof rule.rate === 'number' ? rule.rate : (Array.isArray(rule.rates) && rule.rates.length === 1 ? rule.rates[0] : undefined),
          rates: Array.isArray(rule.rates) && rule.rates.length > 1 ? rule.rates : undefined,
          label: rule.label || rule.description || '',
          condition: rule.classificationCondition || '',
          reference: rule.reference || '',
          authority: rule.authority || '',
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
          isOverride: true
        };
      }
    }
  }

  return null;
}

/**
 * Checks if a TDS/TCS section has been abolished or modified as of a given date.
 */
export function checkTdsTcsStatus(sectionCode, queryDateInput = null) {
  if (!sectionCode) return null;
  const rules = getActiveRules();
  const secRule = rules?.tdsTcsRules?.[sectionCode];
  if (!secRule) return null;

  const targetDateStr = queryDateInput
    ? (typeof queryDateInput === 'string' ? queryDateInput.slice(0, 10) : queryDateInput.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10);

  const qDate = parseDateOnly(targetDateStr);
  if (!qDate) return secRule;

  if (secRule.status === 'abolished' && secRule.abolitionEffectiveDate) {
    const abDate = parseDateOnly(secRule.abolitionEffectiveDate);
    if (abDate && qDate >= abDate) {
      return { ...secRule, isCurrentlyAbolished: true };
    }
  }

  return secRule;
}

/**
 * Returns active compliance notices from the remote rules.
 */
export function getComplianceNotices(category = null) {
  const rules = getActiveRules();
  const list = rules?.complianceNotices || rules?.notices || [];
  if (!Array.isArray(list)) return [];
  if (!category) return list;
  return list.filter(n => n.category === category);
}

/**
 * Returns active statutory banners.
 */
export function getActiveBanners() {
  const rules = getActiveRules();
  return Array.isArray(rules?.banners) ? rules.banners : [];
}
