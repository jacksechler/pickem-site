// Parser for the commissioner-only question batch importer.
// Accepts pipe-separated, tab-separated or standard quoted CSV rows.
(() => {
  const allowedSports = new Set(['NFL','CFB','CBB','CFP','BOWLS','NBA','MLB','OTHER']);
  function csvRows(text){
    const rows=[]; let row=[], field='', quoted=false;
    const src=String(text||'').replace(/^\uFEFF/,'');
    for(let i=0;i<src.length;i++){
      const c=src[i];
      if(c==='"'){
        if(quoted && src[i+1]==='"'){field+='"';i++;}
        else if(!field || quoted) quoted=!quoted;
        else field+=c;
      } else if(c===',' && !quoted){row.push(field);field='';}
      else if((c==='\n'||c==='\r') && !quoted){
        if(c==='\r'&&src[i+1]==='\n')i++;
        row.push(field);rows.push(row);row=[];field='';
      } else field+=c;
    }
    if(quoted) throw new Error('CSV has an unclosed quotation mark.');
    if(field||row.length){row.push(field);rows.push(row);}
    return rows;
  }
  function parse(text){
    const raw=String(text||'').trim();
    if(!raw)return {questions:[],errors:['Paste questions or choose a CSV file first.']};
    let rows;
    try{
      const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim());
      if(lines.some(line=>line.includes('|'))) rows=lines.map(line=>line.split('|'));
      else if(lines.some(line=>line.includes('\t'))) rows=lines.map(line=>line.split('\t'));
      else rows=csvRows(raw);
    }catch(e){return {questions:[],errors:[e.message||'Could not read the question list.']};}
    const questions=[],errors=[];
    rows.forEach((row,index)=>{
      const fields=row.map(v=>String(v??'').trim());
      if(!fields.some(Boolean))return;
      const first=fields[0].toLowerCase(),second=(fields[1]||'').toLowerCase();
      if(index===0 && first==='sport' && ['question','prompt'].includes(second))return;
      if(fields.length<4){errors.push('Row '+(index+1)+': include sport, question, and at least two choices.');return;}
      const sport=fields[0].toUpperCase(),prompt=fields[1],options=fields.slice(2).filter(Boolean);
      if(!allowedSports.has(sport)){errors.push('Row '+(index+1)+': unknown sport '+fields[0]+'.');return;}
      if(!prompt){errors.push('Row '+(index+1)+': question is blank.');return;}
      if(options.length<2){errors.push('Row '+(index+1)+': add at least two choices.');return;}
      if(new Set(options.map(v=>v.toLowerCase())).size!==options.length){errors.push('Row '+(index+1)+': choices must be different.');return;}
      questions.push({sport:sport==='BOWLS'?'Bowls':sport==='OTHER'?'Other':sport,prompt,answer_options:options,question_type:'Multiple Choice',counts_for_score:true});
    });
    if(!questions.length && !errors.length)errors.push('No questions found.');
    return {questions,errors};
  }
  window.QuestionBatchModel={parse,csvRows};
})();
