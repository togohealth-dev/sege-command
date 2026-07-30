/* SEGE Business — UI module. Pure render-from-data + emit-change.
 * Knows nothing about storage (that's Store, in store.js). Drops into a
 * Next.js component later by swapping innerHTML rendering for JSX. */

const FILES = {
  entities:   'mso/entities.json',
  templates:  'mso/contract-templates.json',
  tasks:      'mso/setup-tasks.json',
  compliance: 'reference/state-compliance.json',
  domains:    'marketing/domains.json',
  phones:     'marketing/phones.json',
};
const DATA = {};            // entities, templates, tasks, compliance, domains, phones
let me = null;
let view = 'entities';      // entities | compliance | marketing | renewals
let entityId = null;        // when drilled into an entity
let mktTab = 'phones';      // phones | domains
let filt = {};

const ROLE = { mso:'MSO', days:'Day Docs', night:'Night Docs', tele:'Telemedicine', wound:'Wound Care', billing:'Billing', holding:'Holding', other:'Other' };
const LIFE = { setup:['Setup','p-warn'], active:['Active','p-ok'], dissolve:['Dissolve?','p-bad'], dissolved:['Dissolved','p-idle'] };
const RA   = { active:['Active','p-ok'], needed:['RA needed','p-warn'], unknown:['RA ?','p-idle'] };
const CONTRACT_STATUS = { not_started:'Not started', drafted:'Drafted', sent:'Sent', executed:'Executed', na:'N/A' };
const SETUP_STATUS    = { not_started:'Not started', in_progress:'In progress', complete:'Complete', na:'N/A' };
const RENEWAL_TYPES = [
  { id:'registered_agent', name:'Registered agent' },
  { id:'annual_report',    name:'State annual report' },
  { id:'malpractice',      name:'Malpractice insurance' },
  { id:'business_license', name:'Business license' },
];

/* ---------- utils ---------- */
const $  = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'entity';
const pillLife = (k) => (LIFE[k]||['?','p-idle']);
const structureSide = (e) => e.entity_type === 'LLC' ? 'mso' : 'pc';

function applicableTemplates(e){
  return DATA.templates.templates
    .filter(t => t.applies_to.includes(structureSide(e)))
    .sort((a,b) => a.order - b.order);
}
function contractPct(e){
  let num=0, den=0;
  applicableTemplates(e).forEach(t => {
    const st = (e.contracts[t.id]||{}).status || 'not_started';
    if (st === 'na') return; den++;
    num += st==='executed'?1 : st==='sent'?0.75 : st==='drafted'?0.5 : 0;
  });
  return den ? Math.round(num/den*100) : 0;
}
function setupPct(e){
  let num=0, den=0;
  DATA.tasks.tasks.forEach(t => {
    const st = (e.setup[t.id]||{}).status || 'not_started';
    if (st === 'na') return; den++;
    num += st==='complete'?1 : st==='in_progress'?0.5 : 0;
  });
  return den ? Math.round(num/den*100) : 0;
}
function bar(pct){
  const cls = pct>=100?'full':pct===0?'zero':'';
  return `<div class="prog"><div class="bar"><i class="${cls}" style="width:${pct}%"></i></div><b class="tnum">${pct}%</b></div>`;
}
function complianceFor(abbr){ return (DATA.compliance.states||[]).find(s => s.abbr === abbr); }

/* ---------- load ---------- */
async function loadAll(){
  if (!Store.pat()) { renderLocked(); setConn(); return; }
  $('#view').innerHTML = '<div class="msg">Loading business data…</div>';
  try {
    const keys = Object.keys(FILES);
    const got = await Promise.all(keys.map(k => Store.get(FILES[k])));
    keys.forEach((k,i) => { DATA[k] = got[i].json; });
    if (!DATA.entities) throw new Error('entities.json missing — is the token scoped to sege-business?');
    me = await Store.githubUser().catch(()=>null);
    setConn();
    render();
  } catch (e) {
    if (String(e.message).startsWith('auth')) { renderLocked(true); }
    else $('#view').innerHTML = `<div class="msg">Couldn't load business data (${esc(e.message)}).<br>Your token needs <b>Contents: read &amp; write</b> on <b>togohealth-dev/sege-business</b>.</div>`;
    setConn();
  }
}

/* ---------- top-level render ---------- */
function render(){
  if (!Store.pat()) { renderLocked(); return; }
  $('#nav').style.display = 'flex';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view && !entityId));
  if (view === 'entities')   return entityId ? renderEntityDetail() : renderEntities();
  if (view === 'compliance') return renderCompliance();
  if (view === 'marketing')  return renderMarketing();
  if (view === 'renewals')   return renderRenewals();
}
function go(v){ view = v; entityId = null; filt = {}; window.scrollTo(0,0); render(); }

function renderLocked(expired){
  $('#nav').style.display = 'none';
  $('#view').innerHTML = `<div class="lock">
    <h2>🔒 Business data is private</h2>
    <p>${expired ? 'Your token was rejected or lacks access. ' : ''}This section reads the private
    <b>togohealth-dev/sege-business</b> repo. Connect a GitHub token with
    <b>Contents: read &amp; write</b> on that repo (plus <b>sege-tracker</b> Issues for the rest of the Command Center).</p>
    <button class="btn pri" onclick="openConnect()">Connect a token</button>
  </div>`;
}

/* ============================================================= ENTITIES */
function renderEntities(){
  const ents = DATA.entities.entities;
  const states = [...new Set(ents.map(e=>e.state))].sort();
  const roles  = [...new Set(ents.map(e=>e.role))];
  let list = ents.slice();
  if (filt.state) list = list.filter(e=>e.state===filt.state);
  if (filt.role)  list = list.filter(e=>e.role===filt.role);
  if (filt.ra)    list = list.filter(e=>(e.registered_agent||{}).status===filt.ra);
  if (filt.life)  list = list.filter(e=>e.lifecycle_status===filt.life);

  const active = ents.filter(e=>e.lifecycle_status==='active').length;
  const setupN = ents.filter(e=>e.lifecycle_status==='setup').length;
  const avgC = Math.round(ents.reduce((a,e)=>a+contractPct(e),0)/ents.length);
  const raNeed = ents.filter(e=>(e.registered_agent||{}).status==='needed').length;

  const opt = (val,cur,lbl)=>`<option value="${esc(val)}"${cur===val?' selected':''}>${esc(lbl)}</option>`;
  list.sort((a,b)=> a.state.localeCompare(b.state) || a.legal_name.localeCompare(b.legal_name));

  $('#view').innerHTML = `
    <div class="stats">
      <div class="stat"><b class="tnum">${ents.length}</b><span>Entities</span></div>
      <div class="stat"><b class="tnum">${active}</b><span>Active</span></div>
      <div class="stat"><b class="tnum">${setupN}</b><span>In setup</span></div>
      <div class="stat"><b class="tnum">${avgC}%</b><span>Avg contracts</span></div>
      <div class="stat"><b class="tnum">${raNeed}</b><span>RA needed</span></div>
    </div>
    <div class="crumb"><h2>🔵 Entities &amp; Contracts <span class="count">${list.length} of ${ents.length}</span></h2>
      <div style="margin-left:auto" class="acts">
        <button class="btn" onclick="copyEntityReport()">⧉ Copy report</button>
        <button class="btn pri" onclick="openAddEntity()">+ Entity</button>
      </div>
    </div>
    <div class="filters">
      <div class="fg"><label>State</label><select onchange="setF('state',this.value)"><option value="">All</option>${states.map(s=>opt(s,filt.state,s)).join('')}</select></div>
      <div class="fg"><label>Type</label><select onchange="setF('role',this.value)"><option value="">All</option>${roles.map(r=>opt(r,filt.role,ROLE[r]||r)).join('')}</select></div>
      <div class="fg"><label>Registered agent</label><select onchange="setF('ra',this.value)"><option value="">All</option>${opt('active',filt.ra,'Active')}${opt('needed',filt.ra,'Needed')}${opt('unknown',filt.ra,'Unknown')}</select></div>
      <div class="fg"><label>Lifecycle</label><select onchange="setF('life',this.value)"><option value="">All</option>${Object.keys(LIFE).map(k=>opt(k,filt.life,LIFE[k][0])).join('')}</select></div>
    </div>
    <div class="card">${list.map(entityRow).join('') || '<div class="msg">No entities match.</div>'}</div>`;
}
function entityRow(e){
  const [ll,lc] = pillLife(e.lifecycle_status);
  const [rl,rc] = RA[(e.registered_agent||{}).status] || RA.unknown;
  const raProv = (e.registered_agent||{}).provider;
  return `<div class="row clk" onclick="openEntity('${e.id}')">
    <div class="main">
      <div class="name">${esc(e.legal_name)} <span class="pill p-tag">${esc(e.state)}</span></div>
      <div class="sub">${esc(ROLE[e.role]||e.role)} · ${esc(e.entity_type)}${raProv?' · RA '+esc(raProv):''}${e.owner?' · '+esc(e.owner):''}${e.next_step?' · <i>'+esc(e.next_step)+'</i>':''}</div>
    </div>
    <div style="width:150px">${bar(contractPct(e))}<div class="prog" style="margin-top:3px"><div class="bar"><i class="${setupPct(e)>=100?'full':setupPct(e)===0?'zero':''}" style="width:${setupPct(e)}%"></i></div><small>setup</small></div></div>
    <span class="pill ${rc}">${esc(rl)}</span>
    <span class="pill ${lc}">${esc(ll)}</span>
  </div>`;
}
function setF(k,v){ filt[k]=v||undefined; render(); }
function openEntity(id){ entityId=id; view='entities'; window.scrollTo(0,0); render(); }

function renderEntityDetail(){
  const e = DATA.entities.entities.find(x=>x.id===entityId);
  if (!e){ entityId=null; return renderEntities(); }
  const comp = complianceFor(e.state);
  const tpls = applicableTemplates(e);
  const inp = (field,val,type='text') => `<input type="${type}" value="${esc(val)}" onchange="edEntity('${e.id}','${field}',this.value)">`;
  const sel = (field,val,opts) => `<select onchange="edEntity('${e.id}','${field}',this.value)">${opts.map(([v,l])=>`<option value="${v}"${val===v?' selected':''}>${esc(l)}</option>`).join('')}</select>`;

  $('#view').innerHTML = `
    <div class="crumb">
      <button class="back" onclick="closeEntity()">← Entities</button>
      <h2>${esc(e.legal_name)}</h2>
      <span class="pill ${pillLife(e.lifecycle_status)[1]}">${pillLife(e.lifecycle_status)[0]}</span>
    </div>

    <div class="stats">
      <div class="stat"><b class="tnum">${contractPct(e)}%</b><span>Contracts</span></div>
      <div class="stat"><b class="tnum">${setupPct(e)}%</b><span>Setup</span></div>
      <div class="stat"><b>${esc(e.entity_type)}</b><span>Type · ${esc(ROLE[e.role]||e.role)}</span></div>
      <div class="stat"><b>${esc(e.state)}</b><span>${comp?esc(comp.cpom_status):'—'}</span></div>
    </div>

    <div class="card">
      <h3>Entity details</h3>
      <div class="dgrid">
        <div class="field"><label>Legal name</label>${inp('legal_name',e.legal_name)}</div>
        <div class="field"><label>State</label>${sel('state',e.state,(DATA.compliance.states||[]).map(s=>[s.abbr,s.abbr+' — '+s.state]))}</div>
        <div class="field"><label>Entity type</label>${sel('entity_type',e.entity_type,[['LLC','LLC'],['PLLC','PLLC'],['PC','PC']])}</div>
        <div class="field"><label>Type / use</label>${sel('role',e.role,Object.keys(ROLE).map(k=>[k,ROLE[k]]))}</div>
        <div class="field"><label>Owner</label>${inp('owner',e.owner)}</div>
        <div class="field"><label>Responsible</label>${inp('responsible',e.responsible)}</div>
        <div class="field"><label>Registered agent</label>${inp('ra_provider',(e.registered_agent||{}).provider||'')}</div>
        <div class="field"><label>RA status</label>${sel('ra_status',(e.registered_agent||{}).status||'unknown',[['active','Active'],['needed','Needed'],['unknown','Unknown']])}</div>
        <div class="field"><label>Lifecycle</label>${sel('lifecycle_status',e.lifecycle_status,Object.keys(LIFE).map(k=>[k,LIFE[k][0]]))}</div>
        <div class="field"><label>Next step</label>${inp('next_step',e.next_step)}</div>
        <div class="field" style="grid-column:1/-1"><label>Notes</label>${inp('notes',e.notes)}</div>
      </div>
    </div>

    <div class="card">
      <h3>Setup checklist <span class="count">${setupPct(e)}% complete</span></h3>
      ${DATA.tasks.tasks.map(t=>{
        const it = e.setup[t.id]||{}; const st = it.status||'not_started';
        return `<div class="ck">
          <div class="cn"><span class="dot s-${st}"></span>${esc(t.name)}</div>
          <select onchange="edSetup('${e.id}','${t.id}','status',this.value)">${Object.entries(SETUP_STATUS).map(([v,l])=>`<option value="${v}"${st===v?' selected':''}>${l}</option>`).join('')}</select>
          <input class="lk" placeholder="note…" value="${esc(it.note||'')}" onchange="edSetup('${e.id}','${t.id}','note',this.value)">
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <h3>Contracts <span class="count">${contractPct(e)}% · ${structureSide(e)==='mso'?'MSO (LLC)':'Professional (PC/PLLC)'} forms · <a href="${esc(DATA.templates.templates_folder_url)}" target="_blank" style="color:var(--accent);text-decoration:none">templates ↗</a></span></h3>
      ${tpls.map(t=>{
        const it = e.contracts[t.id]||{}; const st = it.status||'not_started';
        return `<div class="ck">
          <div class="cn"><span class="dot s-${st}"></span>${esc(t.name)}</div>
          <select onchange="edContract('${e.id}','${t.id}','status',this.value)">${Object.entries(CONTRACT_STATUS).map(([v,l])=>`<option value="${v}"${st===v?' selected':''}>${l}</option>`).join('')}</select>
          <input class="lk" placeholder="doc link…" value="${esc(it.doc_url||'')}" onchange="edContract('${e.id}','${t.id}','doc_url',this.value)">
          ${it.doc_url?`<a class="doc" href="${esc(it.doc_url)}" target="_blank">open ↗</a>`:''}
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <h3>Renewals &amp; maintenance</h3>
      <div class="dgrid">
        ${RENEWAL_TYPES.map(rt=>{
          const it = (e.renewals||{})[rt.id]||{};
          return `<div class="field"><label>${esc(rt.name)}</label><input type="date" value="${esc(it.due_date||'')}" onchange="edRenewal('${e.id}','${rt.id}',this.value)"></div>`;
        }).join('')}
      </div>
    </div>

    ${comp?`<div class="card"><h3>${esc(comp.state)} compliance snapshot</h3>
      <div class="ck"><div class="cn">CPOM</div><span class="pill ${cpomCls(comp.cpom_status)}">${esc(comp.cpom_status)}</span>
        <div class="cn">Required entity</div><span>${esc(comp.required_entity)}</span></div>
      <div class="ck"><div class="cn">Malpractice risk</div><span class="pill ${riskCls(comp.malpractice_risk)}">${esc(comp.malpractice_risk)}</span>
        <div class="cn">NP authority</div><span class="pill ${npCls(comp.np_authority)}">${esc(comp.np_authority||'—')}</span></div>
      ${comp.note?`<div class="ck"><div class="cn" style="font-weight:400;color:var(--muted)">${esc(comp.note)}</div></div>`:''}
    </div>`:''}

    <div class="acts" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" onclick="deleteEntity('${e.id}')" style="color:var(--bad)">Delete entity</button>
    </div>`;
}
function closeEntity(){ entityId=null; render(); }

/* entity edits */
function edEntity(id,field,val){
  const e = DATA.entities.entities.find(x=>x.id===id); if(!e) return;
  if (field==='ra_provider'){ e.registered_agent = e.registered_agent||{}; e.registered_agent.provider = val||null; }
  else if (field==='ra_status'){ e.registered_agent = e.registered_agent||{}; e.registered_agent.status = val; }
  else e[field] = val;
  save('entities'); if(['lifecycle_status','ra_status','role','state','legal_name'].includes(field)) render();
}
function edSetup(id,taskId,key,val){
  const e = DATA.entities.entities.find(x=>x.id===id); if(!e) return;
  e.setup[taskId] = e.setup[taskId]||{}; e.setup[taskId][key]=val; e.setup[taskId].updated_at=stamp();
  save('entities'); if(key==='status') render();
}
function edContract(id,tid,key,val){
  const e = DATA.entities.entities.find(x=>x.id===id); if(!e) return;
  e.contracts[tid] = e.contracts[tid]||{}; e.contracts[tid][key]=val; e.contracts[tid].updated_at=stamp();
  save('entities'); if(key==='status'||key==='doc_url') render();
}
function edRenewal(id,rid,val){
  const e = DATA.entities.entities.find(x=>x.id===id); if(!e) return;
  e.renewals = e.renewals||{};
  if (val) e.renewals[rid] = { ...(e.renewals[rid]||{}), due_date:val }; else delete e.renewals[rid];
  save('entities');
}
function deleteEntity(id){
  const e = DATA.entities.entities.find(x=>x.id===id); if(!e) return;
  if (!confirm('Delete '+e.legal_name+'? This removes it from the registry.')) return;
  DATA.entities.entities = DATA.entities.entities.filter(x=>x.id!==id);
  entityId=null; save('entities'); render(); toast('Deleted');
}

/* ============================================================= COMPLIANCE */
function renderCompliance(){
  const rows = DATA.compliance.states.slice();
  let list = rows;
  if (filt.cpom) list = list.filter(s=> (s.cpom_status||'').startsWith(filt.cpom));
  if (filt.np)   list = list.filter(s=> s.np_authority===filt.np);
  if (filt.risk) list = list.filter(s=> s.malpractice_risk===filt.risk);
  if (filt.q){ const q=filt.q.toLowerCase(); list = list.filter(s=> (s.state+s.abbr).toLowerCase().includes(q)); }
  const opt=(v,c,l)=>`<option value="${esc(v)}"${c===v?' selected':''}>${esc(l)}</option>`;
  const entCount = {}; DATA.entities.entities.forEach(e=>entCount[e.state]=(entCount[e.state]||0)+1);

  $('#view').innerHTML = `
    <div class="crumb"><h2>📋 State Compliance <span class="count">${list.length} of ${rows.length}</span></h2></div>
    <div class="note">Regulatory reference — CPOM, required entity, IMLC, malpractice &amp; NP/PA scope. Drives which structure each state needs. Some IMLC values are best-effort from the source sheet.</div>
    <div class="filters">
      <div class="fg"><label>Search</label><input placeholder="state…" value="${esc(filt.q||'')}" oninput="setF('q',this.value)"></div>
      <div class="fg"><label>CPOM</label><select onchange="setF('cpom',this.value)"><option value="">All</option>${opt('Banned',filt.cpom,'Banned')}${opt('Not Banned',filt.cpom,'Not Banned')}</select></div>
      <div class="fg"><label>NP authority</label><select onchange="setF('np',this.value)"><option value="">All</option>${opt('Full',filt.np,'Full')}${opt('Reduced',filt.np,'Reduced')}${opt('Restricted',filt.np,'Restricted')}</select></div>
      <div class="fg"><label>Malpractice</label><select onchange="setF('risk',this.value)"><option value="">All</option>${opt('Low',filt.risk,'Low')}${opt('Medium',filt.risk,'Medium')}${opt('High',filt.risk,'High')}</select></div>
    </div>
    <div class="card"><div class="tblwrap"><table class="tbl">
      <thead><tr><th>State</th><th>CPOM</th><th>Required entity</th><th>IMLC</th><th>Malpractice</th><th>NP</th><th>PA cap</th><th>Entities</th></tr></thead>
      <tbody>${list.map(s=>`<tr>
        <td><b>${esc(s.abbr)}</b> ${esc(s.state)}</td>
        <td><span class="pill ${cpomCls(s.cpom_status)}">${esc(s.cpom_status)}</span></td>
        <td>${esc(s.required_entity)}</td>
        <td><span class="pill ${imlcCls(s.imlc)}">${esc(imlcLbl(s.imlc))}</span></td>
        <td><span class="pill ${riskCls(s.malpractice_risk)}">${esc(s.malpractice_risk)}</span></td>
        <td><span class="pill ${npCls(s.np_authority)}">${esc(s.np_authority||'—')}</span></td>
        <td class="tnum">${esc(s.pa_supervision_cap||'—')}</td>
        <td class="tnum">${entCount[s.abbr]?`<span class="pill p-prog">${entCount[s.abbr]}</span>`:'<span style="color:var(--faint)">–</span>'}</td>
      </tr>${s.note?`<tr><td colspan="8" style="color:var(--muted);font-size:11.5px;padding-top:0">↳ ${esc(s.note)}</td></tr>`:''}`).join('')}</tbody>
    </table></div></div>`;
}
const cpomCls=(s)=> /not banned/i.test(s)? 'p-ok' : /\*/.test(s)?'p-warn':'p-bad';
const riskCls=(r)=> r==='Low'?'p-ok':r==='Medium'?'p-warn':'p-bad';
const npCls=(n)=> n==='Full'?'p-ok':n==='Reduced'?'p-warn':n==='Restricted'?'p-bad':'p-idle';
const imlcCls=(i)=> i==='member'?'p-ok':i==='pending'?'p-warn':'p-idle';
const imlcLbl=(i)=> ({member:'Member',pending:'Pending',not_participating:'Not part.'}[i]||i||'—');

/* ============================================================= MARKETING */
function renderMarketing(){
  const isP = mktTab==='phones';
  const data = isP ? DATA.phones.phones : DATA.domains.domains;
  const monthly = DATA.phones.phones.filter(p=>p.cost_type==='monthly'&&p.cost).reduce((a,p)=>a+parseFloat(p.cost||0),0);
  const oneTime = DATA.phones.phones.filter(p=>p.cost_type==='one_time'&&p.cost).reduce((a,p)=>a+parseFloat(p.cost||0),0);

  $('#view').innerHTML = `
    <div class="crumb"><h2>📣 Marketing Assets</h2>
      <div style="margin-left:auto" class="acts"><button class="btn pri" onclick="openAddAsset()">+ ${isP?'Number':'Domain'}</button></div>
    </div>
    <div class="subnav">
      <button class="${isP?'on':''}" onclick="setMkt('phones')">☎ Vanity numbers (${DATA.phones.phones.length})</button>
      <button class="${!isP?'on':''}" onclick="setMkt('domains')">🌐 Domains (${DATA.domains.domains.length})</button>
    </div>
    ${isP?`<div class="stats"><div class="stat"><b class="tnum">$${monthly.toFixed(2)}</b><span>Monthly</span></div><div class="stat"><b class="tnum">$${oneTime.toFixed(2)}</b><span>One-time</span></div><div class="stat"><b class="tnum">${DATA.phones.phones.length}</b><span>Numbers</span></div></div>`:''}
    ${!isP&&DATA.domains.seed_partial?'<div class="note">Domains are a partial seed from the brainstorm sheets — add or import the rest here.</div>':''}
    <div class="card"><div class="tblwrap"><table class="tbl">
      ${isP?phonesTable():domainsTable()}
    </table></div></div>`;
}
function setMkt(t){ mktTab=t; render(); }
function phonesTable(){
  const st=(p)=>`<select onchange="edAsset('phones','${p.id}','status',this.value)">${['candidate','owned','released'].map(v=>`<option value="${v}"${p.status===v?' selected':''}>${v}</option>`).join('')}</select>`;
  return `<thead><tr><th>Vanity</th><th>Number</th><th>Brand</th><th>State</th><th>Cost</th><th></th><th>Status</th><th></th></tr></thead>
    <tbody>${DATA.phones.phones.map(p=>`<tr>
      <td><b>${esc(p.vanity)}</b></td><td class="tnum">${esc(p.number||'—')}</td><td>${esc(p.brand)}</td>
      <td>${esc(p.state)}</td><td class="tnum">${p.cost?'$'+esc(p.cost):'—'}</td><td style="color:var(--faint)">${esc(p.cost_type||'')}</td>
      <td>${st(p)}</td><td><button class="mini" onclick="delAsset('phones','${p.id}')">✕</button></td>
    </tr>`).join('')}</tbody>`;
}
function domainsTable(){
  const st=(d)=>`<select onchange="edAsset('domains','${d.id}','status',this.value)">${['candidate','owned','released'].map(v=>`<option value="${v}"${d.status===v?' selected':''}>${v}</option>`).join('')}</select>`;
  return `<thead><tr><th>Domain</th><th>Service line</th><th>Brand</th><th>Price</th><th>Status</th><th></th></tr></thead>
    <tbody>${DATA.domains.domains.map(d=>`<tr>
      <td><b>${esc(d.domain)}</b>${d.note?` <span class="pill p-tag">${esc(d.note)}</span>`:''}</td>
      <td>${esc(d.service_line||'')}</td><td>${esc(d.brand||'')}</td><td class="tnum">${d.price?'$'+esc(d.price):'—'}</td>
      <td>${st(d)}</td><td><button class="mini" onclick="delAsset('domains','${d.id}')">✕</button></td>
    </tr>`).join('')}</tbody>`;
}
function edAsset(kind,id,key,val){
  const arr = kind==='phones'?DATA.phones.phones:DATA.domains.domains;
  const it = arr.find(x=>x.id===id); if(!it) return; it[key]=val; save(kind);
}
function delAsset(kind,id){
  const prop = kind==='phones'?'phones':'domains';
  const it = DATA[kind][prop].find(x=>x.id===id); if(!it) return;
  if(!confirm('Remove '+(it.vanity||it.domain)+'?')) return;
  DATA[kind][prop] = DATA[kind][prop].filter(x=>x.id!==id); save(kind); render();
}

/* ============================================================= RENEWALS */
function renderRenewals(){
  const items=[];
  DATA.entities.entities.forEach(e=>{
    Object.entries(e.renewals||{}).forEach(([rid,v])=>{ if(v&&v.due_date) items.push({what:(RENEWAL_TYPES.find(r=>r.id===rid)||{}).name||rid, who:e.legal_name, kind:'entity', id:e.id, date:v.due_date}); });
  });
  DATA.phones.phones.forEach(p=>{ if(p.renewal_date) items.push({what:'Phone: '+p.vanity, who:p.brand, kind:'phone', date:p.renewal_date}); });
  DATA.domains.domains.forEach(d=>{ if(d.renewal_date) items.push({what:'Domain: '+d.domain, who:d.brand, kind:'domain', date:d.renewal_date}); });
  items.sort((a,b)=> a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0,10);
  const dcls=(d)=> d<today?'p-bad':daysBetween(today,d)<=30?'p-warn':'p-ok';
  const dlbl=(d)=> d<today?'Overdue':daysBetween(today,d)<=30?'Soon':'OK';

  $('#view').innerHTML = `
    <div class="crumb"><h2>🗓 Renewals &amp; Maintenance <span class="count">${items.length}</span></h2></div>
    <div class="note">Recurring account maintenance across entities and marketing assets. Set dates on an entity's <b>Renewals &amp; maintenance</b> card (registered agent, annual report, malpractice, license) — they surface here sorted by due date.</div>
    ${items.length?`<div class="card"><div class="tblwrap"><table class="tbl">
      <thead><tr><th>Due</th><th></th><th>Item</th><th>For</th></tr></thead>
      <tbody>${items.map(i=>`<tr class="${i.kind==='entity'?'clk':''}" ${i.kind==='entity'?`onclick="openEntity('${i.id}')"`:''}>
        <td class="tnum">${esc(i.date)}</td><td><span class="pill ${dcls(i.date)}">${dlbl(i.date)}</span></td>
        <td>${esc(i.what)}</td><td>${esc(i.who)}</td></tr>`).join('')}</tbody>
    </table></div></div>`:'<div class="msg">No renewal dates set yet. Add them on any entity\'s detail page.</div>'}`;
}
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

/* ============================================================= ADD MODALS */
function openAddEntity(){
  const states=(DATA.compliance.states||[]).map(s=>`<option value="${s.abbr}">${s.abbr} — ${esc(s.state)}</option>`).join('');
  $('#modalBody').innerHTML = `<h2>Add entity</h2>
    <label>Legal name</label><input id="m_name" placeholder="e.g. InstaMobile Care AZ PLLC">
    <div class="g2">
      <div><label>State</label><select id="m_state">${states}</select></div>
      <div><label>Entity type</label><select id="m_type"><option>LLC</option><option>PLLC</option><option>PC</option></select></div>
      <div><label>Type / use</label><select id="m_role">${Object.entries(ROLE).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Lifecycle</label><select id="m_life">${Object.keys(LIFE).map(k=>`<option value="${k}"${k==='setup'?' selected':''}>${LIFE[k][0]}</option>`).join('')}</select></div>
      <div><label>Owner</label><input id="m_owner"></div>
      <div><label>Responsible</label><input id="m_resp"></div>
    </div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="saveAddEntity()">Create</button></div>`;
  openModal();
}
function saveAddEntity(){
  const name=$('#m_name').value.trim(); if(!name){ toast('Name required'); return; }
  let id=slug(name); const ids=new Set(DATA.entities.entities.map(e=>e.id)); let n=2; while(ids.has(id)){ id=slug(name)+'-'+n++; }
  DATA.entities.entities.push({ id, legal_name:name, state:$('#m_state').value, entity_type:$('#m_type').value,
    role:$('#m_role').value, use_label:ROLE[$('#m_role').value], registered_agent:{provider:null,status:'needed'},
    owner:$('#m_owner').value.trim(), responsible:$('#m_resp').value.trim(), notes:'', next_step:'',
    lifecycle_status:$('#m_life').value, setup:{}, contracts:{}, renewals:{} });
  closeModal(); save('entities'); openEntity(id); toast('Entity added');
}
function openAddAsset(){
  const isP = mktTab==='phones';
  $('#modalBody').innerHTML = isP ? `<h2>Add vanity number</h2>
    <label>Vanity</label><input id="m_vanity" placeholder="(801) 800-TOGO">
    <div class="g2"><div><label>Number</label><input id="m_num" placeholder="801-800-8646"></div>
      <div><label>Brand</label><input id="m_brand" placeholder="Togo"></div>
      <div><label>State</label><input id="m_state2" placeholder="UT or tollfree"></div>
      <div><label>Cost</label><input id="m_cost" placeholder="199.99"></div>
      <div><label>Cost type</label><select id="m_ct"><option value="one_time">one-time</option><option value="monthly">monthly</option></select></div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="saveAddAsset()">Add</button></div>`
  : `<h2>Add domain</h2>
    <label>Domain</label><input id="m_domain" placeholder="quicktogo.com">
    <div class="g2"><div><label>Service line</label><select id="m_sl">${(DATA.domains.service_lines||[]).map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div><label>Brand</label><input id="m_brand" placeholder="Togo"></div>
      <div><label>Price</label><input id="m_price" placeholder="21.99"></div></div>
    <div class="acts" style="justify-content:flex-end"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="saveAddAsset()">Add</button></div>`;
  openModal();
}
function saveAddAsset(){
  if(mktTab==='phones'){
    const v=$('#m_vanity').value.trim(); if(!v){toast('Vanity required');return;}
    DATA.phones.phones.push({ id:'ph-'+slug(v)+'-'+Date.now().toString(36), vanity:v, number:$('#m_num').value.trim(), brand:$('#m_brand').value.trim(), state:$('#m_state2').value.trim()||'any', cost:$('#m_cost').value.trim(), cost_type:$('#m_ct').value, status:'candidate', renewal_date:'', note:'' });
    save('phones');
  } else {
    const d=$('#m_domain').value.trim(); if(!d){toast('Domain required');return;}
    DATA.domains.domains.push({ id:'d-'+slug(d)+'-'+Date.now().toString(36), domain:d, brand:$('#m_brand').value.trim()||'generic', service_line:$('#m_sl').value, state:'any', price:$('#m_price').value.trim(), status:'candidate', renewal_date:'', votes:{}, note:'' });
    save('domains');
  }
  closeModal(); render(); toast('Added');
}

/* ============================================================= SAVE / infra */
let saveTimers={};
function stamp(){ try{ return new Date().toISOString().slice(0,10); }catch(e){ return ''; } }
function save(key){
  showSaving(true);
  clearTimeout(saveTimers[key]);
  saveTimers[key]=setTimeout(async()=>{
    try{ await Store.put(FILES[key], DATA[key], 'Update '+key+' via Command Center'+(me?' ('+me.login+')':'')); showSaving(false); toast('Saved'); }
    catch(e){ showSaving(false); toast('Save failed: '+e.message); }
  }, 650);
}
function copyEntityReport(){
  const lines = DATA.entities.entities.map(e=>`${e.state}\t${e.legal_name}\t${ROLE[e.role]||e.role}\tsetup ${setupPct(e)}%\tcontracts ${contractPct(e)}%\t${e.lifecycle_status}`);
  const txt = 'SEGE Entities — setup & contract status\n\nState\tEntity\tUse\tSetup\tContracts\tLifecycle\n'+lines.join('\n');
  navigator.clipboard.writeText(txt).then(()=>toast('Report copied'),()=>toast('Copy failed'));
}
/* connect + chrome */
function setConn(){
  const on=!!Store.pat();
  $('#conn').className='conn '+(on?'on':'off'); $('#conn').textContent=on?'● Connected':'● View locked';
  $('#connectBtn').style.display=on?'none':'';
  $('#meChip').innerHTML = (on&&me)?`<span class="me"><span class="avatar" style="background:#0e7c86">${esc((me.login||'?')[0].toUpperCase())}</span>${esc(me.login)}</span>`:'';
}
function openConnect(){ $('#connect').classList.add('on'); $('#pat').focus(); }
function closeConnect(){ $('#connect').classList.remove('on'); }
async function saveConnect(){ const v=$('#pat').value.trim(); if(!v){toast('Paste a token');return;} localStorage.setItem('sege-tracker-pat',v); me=null; closeConnect(); toast('Connecting…'); loadAll(); }
function disconnect(){ localStorage.removeItem('sege-tracker-pat'); me=null; renderLocked(); setConn(); toast('Disconnected'); }
function openModal(){ $('#modal').classList.add('on'); }
function closeModal(){ $('#modal').classList.remove('on'); }
let tt; function toast(m){ const e=$('#toast'); e.textContent=m; e.classList.add('show'); clearTimeout(tt); tt=setTimeout(()=>e.classList.remove('show'),2400); }
function showSaving(on){ $('#saving').classList.toggle('show',on); }

window.addEventListener('DOMContentLoaded', loadAll);
