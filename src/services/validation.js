const RUN_TYPES = new Set(['practice', 'race1', 'race2', 'rerun']);
const RUN_STATUSES = new Set(['pending', 'finished', 'dq', 'dnf', 'scratch', 'void']);
const LANGUAGES = new Set(['ja', 'en']);
const HEAT_CODE_PATTERN = /^[A-Za-z0-9]{1,2}$/;

function isNullableInteger(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0);
}

function validateLanguage(value) {
  return LANGUAGES.has(value);
}

function validateHeatCode(value) {
  return HEAT_CODE_PATTERN.test(String(value || '').trim());
}

function normalizeHeatCode(value) {
  return String(value || '').trim().toUpperCase();
}

function validateRunPayload(payload, { partial = false } = {}) {
  const entryId = Number(payload.entryId);
  if (!partial && (!Number.isInteger(entryId) || entryId <= 0)) {
    return 'entryId is required';
  }

  if (!partial && !payload.runType) {
    return 'runType is required';
  }

  if (payload.runType !== undefined && !RUN_TYPES.has(payload.runType)) {
    return 'runType is invalid';
  }

  if (payload.status !== undefined && !RUN_STATUSES.has(payload.status)) {
    return 'status is invalid';
  }

  const splitMs = payload.splitMs ?? null;
  const goalMs = payload.goalMs ?? null;

  if (!isNullableInteger(splitMs)) {
    return 'splitMs must be a non-negative integer';
  }

  if (!isNullableInteger(goalMs)) {
    return 'goalMs must be a non-negative integer';
  }

  if (splitMs !== null && goalMs !== null && splitMs > goalMs) {
    return 'split time must not exceed goal time';
  }

  if (payload.status === 'finished' && goalMs === null) {
    return 'goalMs is required when status is finished';
  }

  return null;
}

module.exports = {
  normalizeHeatCode,
  validateHeatCode,
  validateLanguage,
  validateRunPayload,
};
