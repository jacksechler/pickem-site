// Render a shareable data graphic directly from the displayed poll.
(() => {
  function loadImage(url){
    return new Promise(resolve=>{
      if(!url){resolve(null);return;}
      const image=new Image();
      image.crossOrigin='anonymous';
      const timer=setTimeout(()=>resolve(null),4000);
      image.onload=()=>{clearTimeout(timer);resolve(image);};
      image.onerror=()=>{clearTimeout(timer);resolve(null);};
      image.src=url;
    });
  }
  async function render({rows,title,subtitle,footer}){
    const [logo,...logos]=await Promise.all([loadImage('ltspn-logo.png'),...rows.map(row=>loadImage(row.logo))]);
    const canvas=document.createElement('canvas');
    canvas.width=1080;canvas.height=1730;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#0d1626';ctx.fillRect(0,0,1080,1730);
    ctx.fillStyle='#b81f35';ctx.fillRect(0,0,1080,12);
    function text(value,x,y,size,color='#f5f7fc',weight=700,maxWidth){
      ctx.fillStyle=color;ctx.font=weight+' '+size+'px system-ui, sans-serif';
      let content=String(value);
      if(maxWidth)while(content.length>1&&ctx.measureText(content).width>maxWidth)content=content.slice(0,-2)+'…';
      ctx.fillText(content,x,y);
    }
    if(logo){const ratio=Math.min(240/logo.width,95/logo.height);ctx.drawImage(logo,54,38,logo.width*ratio,logo.height*ratio);}
    else text('LTSPN',54,110,64,'#ff546b',900);
    text(title,54,192,48,'#ffffff',900,970);
    text(subtitle,54,236,25,'#b9c8df',500,970);
    text('RANK',54,296,18,'#a5b5ce');text('TEAM',154,296,18,'#a5b5ce');
    text('PTS',850,296,18,'#a5b5ce');text('1ST',966,296,18,'#a5b5ce');
    rows.slice(0,25).forEach((row,index)=>{
      const y=316+index*50;
      ctx.fillStyle=index%2===0?'#18253b':'#122035';ctx.fillRect(40,y,1000,48);
      text(row.rank,58,y+33,25,'#f1cd81',800);
      const image=logos[index];
      if(image){const scale=Math.min(34/image.width,34/image.height);ctx.drawImage(image,120,y+7,image.width*scale,image.height*scale);}
      text(row.name,168,y+33,24,'#f5f7fc',700,660);
      text(row.points,850,y+33,24);text(row.first??'—',966,y+33,24);
    });
    if(!rows.length)text('No submitted ballots yet',54,370,28);
    text(footer,54,1620,21,'#b9c8df',500,975);
    text('LTSPN • COLLEGE FOOTBALL • JUST FOR FUN',54,1674,20,'#f1cd81',800);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Graphic could not be created')),'image/png'));
  }
  window.LTSPNPollGraphic={render};
})();
