// Display-only league member name formatting.
// Usernames and authentication records stay unchanged.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.MemberNames=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const fullNames={
    jacksechler:'Jack Sechler',
    cadechristy:'Cade Christy',
    brodyravenstahl:'Brody Ravenstahl',
    chasecarulli:'Chase Carulli',
    evanlewis:'Evan Lewis',
    jacksongraham:'Jackson Graham',
    klayfunovits:'Klay Funovits',
    lincolnconstant:'Lincoln Constant'
  };
  const key=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
  const trim=value=>String(value||'').trim().replace(/\s+/g,' ');
  function full(input){
    const person=input&&typeof input==='object'?input:null;
    const display=trim(person?.display_name||person?.name||'');
    const username=trim(person?.username||'');
    const exactDisplay=fullNames[key(display)],exactUser=fullNames[key(username)];
    if(exactDisplay)return exactDisplay;
    if(display.includes(' '))return display;
    if(exactUser)return exactUser;
    // Avoid inventing a split for unknown concatenated usernames.
    return display||fullNames[key(username)]||username||'Member';
  }
  return {full,first:full,knownNames:Object.freeze({...fullNames})};
});