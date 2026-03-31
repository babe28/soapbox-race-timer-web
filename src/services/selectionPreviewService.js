const previewState = {
  entryId: null,
  updatedAt: null,
};

function getSelectionPreview() {
  return { ...previewState };
}

function setSelectionPreview(entryId) {
  previewState.entryId = Number(entryId) || null;
  previewState.updatedAt = new Date().toISOString();
  return getSelectionPreview();
}

function clearSelectionPreview() {
  previewState.entryId = null;
  previewState.updatedAt = new Date().toISOString();
  return getSelectionPreview();
}

module.exports = {
  getSelectionPreview,
  setSelectionPreview,
  clearSelectionPreview,
};
