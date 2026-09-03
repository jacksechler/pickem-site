(() => {
  const RESET_URL = SUPABASE + '/functions/v1/pickem/reset-password';
  const ISSUE_URL = SUPABASE + '/functions/v1/pickem/issue-reset';

  function installResetUI(){
    const loginPanel = el('loginPanel');
    if(!loginPanel || el('resetPanel')) return;

    const forgot = document.createElement('button');
    forgot.type = 'button';
    forgot.className = 'linkbtn';
    forgot.style.marginTop = '12px';
    forgot.textContent = 'Forgot password?';
    forgot.onclick = openResetPanel;
    loginPanel.appendChild(forgot);

    const panel = document.createElement('div');
    panel.id = 'resetPanel';
    panel.className = 'hidden';
    panel.innerHTML = '<h2>Reset Password</h2>'+
      '<p class="muted">Ask the commissioner for a one-time reset code.</p>'+
      '<label>Username</label><input id="resetUser" placeholder="firstnamelastname">'+
      '<label>Reset code</label><input id="resetCode" placeholder="ABCD-1234" autocomplete="one-time-code">'+
      '<label>New password</label><input id="resetPass" type="password" autocomplete="new-password">'+
      '<button class="btn full" onclick="resetLeaguePassword()">Set New Password</button>'+
      '<button class="linkbtn" style="margin-top:12px" onclick="setAuthMode(\'login\')">Back to login</button>';
    loginPanel.parentElement.insertBefore(panel, loginPanel.nextSibling);
  }

  window.openResetPanel = function(){
    installResetUI();
    el('loginPanel')?.classList.add('hidden');
    el('activatePanel')?.classList.add('hidden');
    el('resetPanel')?.classList.remove('hidden');
    if(el('loginTab')) el('loginTab').className='btn secondary';
    if(el('activateTab')) el('activateTab').className='btn secondary';
    if(el('authMsg')) el('authMsg').textContent='';
  };

  const originalSetAuthMode = window.setAuthMode;
  window.setAuthMode = function(mode){
    el('resetPanel')?.classList.add('hidden');
    return originalSetAuthMode(mode);
  };

  window.resetLeaguePassword = async function(){
    const msg=el('authMsg');
    const username=normalizeUsername(el('resetUser')?.value||'');
    const code=(el('resetCode')?.value||'').trim();
    const password=el('resetPass')?.value||'';
    if(username.length<2){msg.textContent='Enter your username.';return;}
    if(!code){msg.textContent='Enter the reset code.';return;}
    if(password.length<8){msg.textContent='Use at least 8 characters.';return;}
    msg.textContent='Resetting password…';
    try{
      const r=await fetch(RESET_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,code,password})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not reset password');
      el('loginUser').value=username;
      el('loginPass').value='';
      setAuthMode('login');
      msg.textContent='Password reset. Log in with your new password.';
    }catch(e){msg.textContent=e.message||'Could not reset password';}
  };

  window.issuePasswordReset = async function(username){
    if(profile?.role!=='commissioner') return;
    try{
      const r=await fetch(ISSUE_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,apikey:KEY},body:JSON.stringify({username})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not create reset code');
      alert('Reset code for '+(d.display_name||username)+': '+d.code+'\n\nThis code expires in 30 minutes. Give the code to that player; they can choose their own new password from Forgot password?.');
    }catch(e){alert(e.message||'Could not create reset code');}
  };

  function installCommissionerResetButtons(){
    if(profile?.role!=='commissioner') return;
    document.querySelectorAll('#commissionerBox .player-row').forEach(row=>{
      if(!row.querySelector('.pill.good')) return;
      const preview=row.querySelector('[id^="playerUserPreview"]');
      const username=(preview?.textContent||'').trim();
      const holder=row.querySelector('.slot-save');
      if(!holder || !username || username==='—') return;
      holder.innerHTML='<button class="btn secondary" type="button">Reset Password</button>';
      holder.querySelector('button').onclick=()=>issuePasswordReset(username);
    });
  }

  const originalRenderCommissioner = window.renderCommissioner;
  window.renderCommissioner = async function(){
    const out = await originalRenderCommissioner();
    installCommissionerResetButtons();
    return out;
  };

  installResetUI();
  if(el('loginUser')) el('loginUser').placeholder='firstnamelastname';
})();
