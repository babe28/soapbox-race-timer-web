const previewState = {
  entryId: null,
  splitMs: null,
  goalMs: null,
  status: null,
  updatedAt: null,
};

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getOverlayPreview() {
  return { ...previewState };
}

function setOverlayPreview(nextState = {}) {
  previewState.entryId = Number(nextState.entryId) || null;
  previewState.splitMs = toFiniteNumber(nextState.splitMs);
  previewState.goalMs = toFiniteNumber(nextState.goalMs);
  previewState.status = nextState.status ? String(nextState.status) : null;
  previewState.updatedAt = new Date().toISOString();
  return getOverlayPreview();
}

function clearOverlayPreview() {
  previewState.entryId = null;
  previewState.splitMs = null;
  previewState.goalMs = null;
  previewState.status = null;
  previewState.updatedAt = new Date().toISOString();
  return getOverlayPreview();
}

module.exports = {
  getOverlayPreview,
  setOverlayPreview,
  clearOverlayPreview,
};
