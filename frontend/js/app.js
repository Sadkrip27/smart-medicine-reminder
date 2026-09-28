const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s); const api=async(path,opts={})=>{const r=await fetch('/api'+path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||`Request failed (${r.status})`);return r.status===204?null:r.json()};
let medicines=[]; const toast=(msg,bad=false)=>{const t=$('#toast');t.textContent=msg;t.style.background=bad?'#b94b5a':'#202b3b';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}; const fmtTime=v=>{if(!v)return '—';const [h,m]=v.split(':').map(Number);return `${((h+11)%12)+1}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`}; const fmtDate=v=>v?new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'—';
function showPage(page){$$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${page}`));$$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const titles={dashboard:'Good evening, caregiver',medicines:'Manage your medicines',history:'Medicine history',device:'Connected device',settings:'System settings'};$('#page-title').textContent=titles[page]||titles.dashboard; if(page==='medicines')loadMedicines();if(page==='history')loadHistory();if(page==='device')loadDevice()};
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page))); const statusBadge=s=>`<span class="status ${String(s).toLowerCase()}">${s==='TAKEN'?'✓ ':s==='MISSED'?'! ':'● '}${s}</span>`;
let activeReminderId = null;
let reminderTimer = null;

function hideReminder() {
  const overlay = $('#reminder-overlay');

  if (overlay) {
    overlay.classList.add('hidden');
  }

  activeReminderId = null;
  reminderTimer = null;
}

function showReminder(reminder) {
  if (!reminder || activeReminderId === reminder.id) return;

  activeReminderId = reminder.id;

  $('#reminder-overlay').classList.remove('hidden');
  $('#reminder-status').className = 'status triggered';
  $('#reminder-status').textContent = '● REMINDER ACTIVE';
  $('#reminder-icon').textContent = '🔔';

  $('#reminder-title').textContent = reminder.name;
  $('#reminder-dosage').textContent = reminder.dosage || '—';
  $('#reminder-time').textContent = fmtTime(
    reminder.time || reminder.scheduled_time.slice(11, 16)
  );
  $('#reminder-frequency').textContent =
    reminder.frequency || 'Daily';

  $('#reminder-description').textContent =
    reminder.description || 'No additional instructions';

  $('#reminder-message').textContent =
    'Please take your medicine and press the physical button to confirm.';

  $('#reminder-confirmation').classList.add('hidden');
}

function showReminderOutcome(reminder) {
  $('#reminder-overlay').classList.remove('hidden');

  const taken = reminder.status === 'TAKEN';

  $('#reminder-status').className =
    `status ${taken ? 'taken' : 'missed'}`;

  $('#reminder-status').textContent =
    taken ? '✓ TAKEN' : '! MISSED';

  $('#reminder-icon').textContent = taken ? '✓' : '!';

  $('#reminder-message').textContent = taken
    ? 'Medicine confirmed as taken.'
    : 'This reminder was not confirmed.';

  $('#reminder-confirmation').classList.remove('hidden');

  $('#reminder-confirmation').textContent = taken
    ? `Confirmed at ${fmtDate(reminder.confirmed_at)}`
    : 'The reminder was marked missed.';

  clearTimeout(reminderTimer);

  reminderTimer = setTimeout(() => {
    hideReminder();
    loadDashboard();
  }, 4000);
}

async function loadDashboard() {
  try {
    const [dashboard, rows, device] = await Promise.all([
      api('/dashboard'),
      api('/reminders/today'),
      api('/esp32/status')
    ]);

    $('#stat-meds').textContent = dashboard.totalMedicines;
    $('#stat-today').textContent = dashboard.todayCount;
    $('#stat-taken').textContent = dashboard.taken;
    $('#stat-attention').textContent =
      dashboard.pending + dashboard.missed;

    $('#today-list').innerHTML = rows.length
      ? rows.map(row => `
          <div class="schedule-row">
            <div class="schedule-time">
              ${fmtTime(row.time || row.scheduled_time.slice(11, 16))}
            </div>

            <div>
              <div class="row-name">
                <i class="med-dot"></i>${row.name}
              </div>

              <div class="row-dosage">
                ${row.dosage}
                ${row.description ? ` · ${row.description}` : ''}
              </div>
            </div>

            ${statusBadge(row.status)}
          </div>
        `).join('')
      : '<div class="empty">No reminders logged today.</div>';

    renderDevice(device);

    $('#api-indicator').innerHTML =
      '<i></i> API connected';

    const activeReminder =
      rows.find(row => row.status === 'TRIGGERED');

    if (activeReminder) {
      showReminder(activeReminder);
    }

    if (activeReminderId && !activeReminder) {
      const finishedReminder = rows.find(
        row => row.id === activeReminderId &&
          (row.status === 'TAKEN' || row.status === 'MISSED')
      );

      if (finishedReminder) {
        showReminderOutcome(finishedReminder);
      }
    }
  } catch (error) {
    $('#api-indicator').textContent = 'API unavailable';
    toast(error.message, true);
  }
}
function renderDevice(d){const online=d.status==='ONLINE';const cls=online?'online':'missed';const text=online?'● ONLINE':'● OFFLINE';['#device-status','#detail-status'].forEach(s=>{const x=$(s);if(x){x.className=`status ${cls}`;x.textContent=text}});$('#device-name').textContent=d.device_uid||'ESP32-MED-001';$('#device-last').textContent=d.last_seen?`Last seen ${fmtDate(d.last_seen)}`:'No heartbeat received';$('#device-rtc').textContent=d.rtc_status||'UNKNOWN';$('#device-rssi').textContent=d.wifi_rssi==null?'—':`${d.wifi_rssi} dBm`;$('#device-fw').textContent=d.firmware_version||'—';if($('#detail-name')){$('#detail-name').textContent=d.device_name||'ESP32 Medicine Device';$('#detail-id').textContent=d.device_uid||'ESP32-MED-001';$('#detail-last').textContent=fmtDate(d.last_seen);$('#detail-rssi').textContent=d.wifi_rssi==null?'—':`${d.wifi_rssi} dBm`;$('#detail-rtc').textContent=d.rtc_status||'UNKNOWN';$('#detail-fw').textContent=d.firmware_version||'—'}}
async function loadMedicines(){try{medicines=await api('/medicines');const groups={};medicines.forEach(m=>(groups[m.id]??=[]).push(m));$('#medicine-cards').innerHTML=Object.entries(groups).map(([id,items])=>{const m=items[0];return `<div class="med-card"><div><span class="badge teal">ACTIVE</span><h3>${m.name}</h3><p>${m.dosage}</p><p>◷ ${items.map(x=>fmtTime(x.time)).join(', ')} · ${items[0].frequency}</p><p>${m.description||'No additional instructions'}</p></div><div class="actions"><button onclick="editMedicine(${id})">Edit</button><button onclick="deleteMedicine(${id})">Delete</button></div></div>`}).join('')||'<div class="empty">No medicines yet. Add your first prescription.</div>'}catch(e){toast(e.message,true)}}
function editMedicine(id){const m=medicines.find(x=>x.id==id);if(!m)return;$('#edit-id').value=m.id;$('#med-name').value=m.name;$('#med-dosage').value=m.dosage;$('#med-description').value=m.description||'';$('#med-time').value=m.time||'08:00';$('#med-frequency').value=m.frequency||'DAILY';$('#med-start').value=m.start_date||new Date().toISOString().slice(0,10);$('#med-end').value=m.end_date||'';$('#form-title').textContent='Edit medicine';$('#medicine-form').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})};window.editMedicine=editMedicine;
async function deleteMedicine(id){if(!confirm('Remove this medicine?'))return;try{await api('/medicines/'+id,{method:'DELETE'});toast('Medicine removed');loadMedicines();loadDashboard()}catch(e){toast(e.message,true)}}window.deleteMedicine=deleteMedicine;
$('#show-form').addEventListener('click',()=>{$('#edit-id').value='';$('#med-form').reset();$('#med-start').value=new Date().toISOString().slice(0,10);$('#form-title').textContent='Add a medicine';$('#medicine-form').classList.remove('hidden')});$('#cancel-form').addEventListener('click',()=>$('#medicine-form').classList.add('hidden'));$('#med-form').addEventListener('submit',async e=>{e.preventDefault();const id=$('#edit-id').value;const body={name:$('#med-name').value,dosage:$('#med-dosage').value,description:$('#med-description').value,time:$('#med-time').value,frequency:$('#med-frequency').value,startDate:$('#med-start').value,endDate:$('#med-end').value};try{await api(id?'/medicines/'+id:'/medicines',{method:id?'PUT':'POST',body:JSON.stringify(body)});toast(id?'Medicine updated':'Medicine added');$('#medicine-form').classList.add('hidden');loadMedicines();loadDashboard()}catch(e){toast(e.message,true)}});
async function loadHistory(){try{const rows=await api('/reminders/history');const filter=$('#history-filter').value;$('#history-body').innerHTML=rows.filter(r=>filter==='ALL'||r.status===filter).map(r=>`<tr><td>${fmtDate(r.scheduled_time)}</td><td><strong>${r.name}</strong></td><td>${r.dosage}</td><td>${fmtTime(r.time)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No history entries yet.</td></tr>'}catch(e){toast(e.message,true)}}$('#history-filter').addEventListener('change',loadHistory);
async function loadDevice(){try{renderDevice(await api('/esp32/status'))}catch(e){toast(e.message,true)}}$('#test-btn').addEventListener('click',async()=>{try{const r=await api('/test-reminder',{method:'POST'});toast('Test reminder triggered — physical button can confirm it');loadDashboard();loadHistory()}catch(e){toast(e.message,true)}});loadDashboard();setInterval(loadDashboard,5000);
