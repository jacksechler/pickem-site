(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LTSPNPollModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function rank(ballots, name = id => id) {
    const totals = new Map();
    for (const ballot of ballots || []) {
      for (const [index, id] of (ballot.teams || []).slice(0,25).entries()) {
        const row = totals.get(id) || {id, points:0, first:0};
        row.points += 25-index;
        row.first += index === 0 ? 1 : 0;
        totals.set(id,row);
      }
    }
    let previous = null, place = 0;
    return [...totals.values()].sort((a,b) => b.points-a.points || name(a.id).localeCompare(name(b.id))).map((row,index) => {
      if (row.points !== previous) place=index+1;
      previous=row.points;
      return {...row,rank:place};
    });
  }
  function compare(current, previous, available) {
    const old = new Map(previous.filter(row=>row.rank<=25).map(row=>[row.id,row.rank]));
    const included = new Set(current.filter(row=>row.rank<=25).map(row=>row.id));
    return {
      rows:current.map(row=>({...row,movement:!available?'—':!old.has(row.id)?'NEW':old.get(row.id)===row.rank?'—':old.get(row.id)>row.rank?'↑'+(old.get(row.id)-row.rank):'↓'+(row.rank-old.get(row.id))})),
      dropped:available?previous.filter(row=>row.rank<=25&&!included.has(row.id)):[]
    };
  }
  function previousWeek(current,weeks) {
    if (!current) return null;
    return weeks.filter(w=>w.season_id===current.season_id&&Number(w.number)<Number(current.number))
      .sort((a,b)=>Number(b.number)-Number(a.number))[0] || null;
  }
  const draftKey=(userId,weekId)=>'ltspnDraft:v1:'+JSON.stringify([userId,weekId]);
  function readDraft(storage,userId,weekId,catalog) {
    try {
      const value=JSON.parse(storage.getItem(draftKey(userId,weekId))||'null');
      if(value?.version!==1||!Array.isArray(value.teams))return null;
      const valid=new Set(catalog.map(team=>team.id));
      return {...value,teams:[...new Set(value.teams)].filter(id=>valid.has(id)).slice(0,25)};
    } catch { return null; }
  }
  function saveDraft(storage,userId,weekId,teams,base) {
    try { storage.setItem(draftKey(userId,weekId),JSON.stringify({version:1,teams:[...teams],base:base||null}));return true; }
    catch { return false; }
  }
  function clearDraft(storage,userId,weekId) {
    try { storage.removeItem(draftKey(userId,weekId));return true; } catch { return false; }
  }
  return {rank,compare,previousWeek,draftKey,readDraft,saveDraft,clearDraft};
});
