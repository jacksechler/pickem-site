/* One-off 2026 holiday schedule. All boundaries are midnight America/New_York. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeasonalThemesModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const seasons = Object.freeze([
    Object.freeze({ id: 'thanksgiving', start: Date.parse('2026-11-19T00:00:00-05:00'), end: Date.parse('2026-11-27T00:00:00-05:00'), color: '#21140f' }),
    Object.freeze({ id: 'christmas', start: Date.parse('2026-12-01T00:00:00-05:00'), end: Date.parse('2026-12-26T00:00:00-05:00'), color: '#101b17' }),
    Object.freeze({ id: 'newyear', start: Date.parse('2026-12-31T00:00:00-05:00'), end: Date.parse('2027-01-02T00:00:00-05:00'), color: '#0b1321' })
  ]);
  function at(time) {
    const now = Number(time);
    return seasons.find(season => now >= season.start && now < season.end) || null;
  }
  function nextBoundary(time) {
    const now = Number(time);
    return seasons.flatMap(season => [season.start, season.end]).find(boundary => boundary > now) ?? null;
  }
  return Object.freeze({ seasons, at, nextBoundary });
});
