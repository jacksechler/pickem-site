// Off-main-thread historical forecasts. All data supplied is finalized / public to league members.
// Worker receives only published weekly scores and finalized playoff results.
importScripts('championship_odds_model.js?v=1','championship_history_model.js?v=1');
self.onmessage=event=>{
  const data=event.data;
  if(!data||data.type!=='rebuild')return;
  const {requestId,timeline,postseason=[]}=data;
  try{
    if(timeline?.kind!=='ready')throw new Error(timeline?.reason||'League history is unavailable.');
    const snapshots=[];
    const total=timeline.timeline.length+postseason.length;
    let done=0;
    for(const checkpoint of timeline.timeline){
      const forecast=self.ChampionshipHistoryModel.predictRegular(
        checkpoint,self.ChampionshipOddsModel,{
          seasonId:timeline.seasonId,regularWeekCount:timeline.regularWeekCount,samples:1800
        });
      if(forecast.kind!=='estimate')throw new Error(forecast.reason||'Historical projection failed.');
      snapshots.push({id:checkpoint.id,label:checkpoint.label,shortLabel:checkpoint.shortLabel,
        weekNumber:checkpoint.weekNumber,kind:checkpoint.kind,odds:forecast.titleOdds,
        samples:forecast.samples});
      self.postMessage({requestId,type:'progress',done:++done,total});
    }
    for(const point of postseason){
      const forecast=self.ChampionshipHistoryModel.predictPostseason(
        point,self.ChampionshipOddsModel,timeline.history,{
          seasonId:timeline.seasonId,samples:2400
        });
      if(forecast.kind!=='estimate'&&forecast.kind!=='official')throw new Error(forecast.reason||'Playoff projection failed.');
      snapshots.push({id:point.id,label:point.label,shortLabel:point.shortLabel,
        kind:point.kind,odds:forecast.titleOdds,samples:forecast.samples});
      self.postMessage({requestId,type:'progress',done:++done,total});
    }
    self.postMessage({requestId,type:'done',snapshots});
  }catch(error){
    self.postMessage({requestId,type:'error',reason:String(error?.message||error)});
  }
};