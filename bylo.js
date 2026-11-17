/* «Было и стало» (вариант A, две аудиозаписи одна под другой).
   «Было» — первая запись голоса ученика, сделанная здесь, в приложении,
   и сохранённая в базе (student_intake.reference_takes, source: 'app').
   «Стало» — последняя запись с урока, которую Николай открыл ученику.

   Диктофон и плеер записей перенесены из базы (baza-dannih, компонент
   «Voice Recorder & Player»: vrRecorderHtml, vrTakeRowDark, dnStartRecording,
   vrWireTakeRow …) один в один. Отличия от базы, согласованные с Николаем:
   у ученика нет кнопки «Виден ученику / Скрыт» (это решает педагог), есть
   «Удалить» и «Загрузить файл»; запись «Стало» с урока ученик только слушает. */

var BYLO = { loaded: false, loading: false, err: "", was: null, now: null, nowDate: null, serverWasId: null, seq: false, rec: null };

function kbPad(n) { return String(n).padStart(2, "0"); }

/* ---------------- из базы: общие помощники диктофона ---------------- */
function vrBlankRec(){ return { active:false, paused:false, saving:false, justSaved:false, seconds:0, error:'', levels:[], peaks:[], markers:[], pendingTake:null, visibleToStudent:true, mediaRecorder:null, stream:null, chunks:[], ctx:null, timer:null, levelTimer:null }; }
function vrDeviceId(){ try{ return localStorage.getItem('vrInputDeviceId')||''; }catch(e){ return ''; } }
function vrSetDeviceId(id){ try{ localStorage.setItem('vrInputDeviceId', id||''); }catch(e){} }
function vrListInputDevices(selectEl){ if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return; navigator.mediaDevices.enumerateDevices().then(list=>{ const mics = list.filter(d=>d.kind==='audioinput'); const cur = vrDeviceId(); selectEl.innerHTML = mics.length ? mics.map((d,i)=>`<option value="${d.deviceId}" ${d.deviceId===cur?'selected':''}>${d.label || ('Микрофон '+(i+1))}</option>`).join('') : `<option value="">Микрофон по умолчанию</option>`; }).catch(()=>{}); }
function vrUid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function vrNewMarker(t){ return { id: vrUid(), t: Math.round(t*10)/10, label: '', createdAt: new Date().toISOString() }; }
function vrMarkerTime(m){ return m.t!=null ? m.t : (m.sec||0); }
function vrSortedMarkers(markers){ return (markers||[]).slice().sort((a,b)=> vrMarkerTime(a)-vrMarkerTime(b)); }
function vrFindNearMarker(markers, t, thresh){ thresh = thresh||0.3; let best=-1, bestD=Infinity; (markers||[]).forEach((m,i)=>{ const d=Math.abs(vrMarkerTime(m)-t); if(d<thresh && d<bestD){ bestD=d; best=i; } }); return best; }
function vrCreateOrEditMarker(rk, take, t, persistFn, repaintFn){
  const nearIdx = vrFindNearMarker(take.markers, t, 0.3);
  if(nearIdx>=0){
    window.__vrPendingEditMarker = { rk: rk, markerId: (take.markers||[])[nearIdx].id };
    repaintFn();
    return;
  }
  const m = vrNewMarker(t);
  take.markers = (take.markers||[]).concat([m]);
  const sorted = vrSortedMarkers(take.markers);
  const idx = sorted.findIndex(function(x){ return x.id===m.id; });
  m.label = 'Метка ' + (idx+1);
  persistFn();
  window.__vrPendingEditMarker = { rk: rk, markerId: m.id };
  repaintFn();
}
function vrDownsample(peaks, n){
  peaks = peaks||[];
  if(!peaks.length) return Array.from({length:n}).map(()=>0);
  const out = [];
  const bucket = peaks.length/n;
  for(let i=0;i<n;i++){
    const start = Math.floor(i*bucket), end = Math.max(start+1, Math.floor((i+1)*bucket));
    let m = 0;
    for(let j=start;j<end && j<peaks.length;j++){ m = Math.max(m, peaks[j]); }
    out.push(m);
  }
  const max = Math.max(0.0001, Math.max.apply(null, out));
  return out.map(v=>v/max);
}
function vrFmtTime(sec){ sec = Math.max(0, Math.floor(sec||0)); return kbPad(Math.floor(sec/60))+':'+kbPad(sec%60); }
window.__vrAudios = window.__vrAudios || {};
function vrStopOtherAudio(exceptKey){ Object.keys(window.__vrAudios).forEach(k=>{ if(k!==exceptKey){ const a = window.__vrAudios[k]; if(a && !a.paused) a.pause(); } }); }
function vrShowUndoToast(message, onUndo, onFinal){
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#23201D;color:#F7F3EC;padding:12px 18px;border-radius:10px;font-size:13px;display:flex;gap:14px;align-items:center;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.3);font-family:inherit;';
  el.innerHTML = '<span>'+message+'</span><button type="button" style="background:none;border:none;color:#C97B62;font-weight:700;cursor:pointer;font-size:13px;font-family:inherit;">Отменить</button>';
  document.body.appendChild(el);
  let done = false;
  const finish = (undo)=>{ if(done) return; done = true; el.remove(); if(undo){ onUndo(); } else { onFinal(); } };
  el.querySelector('button').onclick = ()=> finish(true);
  const timer = setTimeout(()=> finish(false), 10000);
  return { cancel: ()=>{ clearTimeout(timer); finish(true); } };
}
window.__vrActiveRecs = window.__vrActiveRecs || [];
function vrRegisterRec(rec){ if(window.__vrActiveRecs.indexOf(rec)<0) window.__vrActiveRecs.push(rec); }
function vrUnregisterRec(rec){ const i = window.__vrActiveRecs.indexOf(rec); if(i>=0) window.__vrActiveRecs.splice(i,1); }
window.addEventListener('beforeunload', function(e){
  const busy = window.__vrActiveRecs.some(function(r){ return r.active || r.saving; });
  if(busy){ e.preventDefault(); e.returnValue = ''; return ''; }
});

/* Горячие клавиши базы (M, ←/→, пробел, Enter, R, Escape) — только на этом экране. */
function vrKeyTarget(){ const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase(); return tag==='input' || tag==='textarea' || tag==='select' || (document.activeElement && document.activeElement.isContentEditable); }
document.addEventListener('keydown', function(e){
  if(state.screen !== 'bylo' || e.repeat) return;
  if(e.key==='m' || e.key==='M'){
    if(vrKeyTarget()) return;
    let targetKey = null, targetAudio = null;
    for(const k in window.__vrAudios){ const a = window.__vrAudios[k]; if(a && !a.paused){ targetKey = k; targetAudio = a; break; } }
    if(!targetKey) return;
    const ctx = window.__vrTakeCtx && window.__vrTakeCtx[targetKey];
    if(!ctx) return;
    vrCreateOrEditMarker(targetKey, ctx.take, targetAudio.currentTime, ctx.persistFn, ctx.repaintFn);
  } else if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
    if(vrKeyTarget()) return;
    const audio = document.querySelector('[data-vr-audio]');
    if(!audio) return;
    e.preventDefault();
    const d = audio.duration || 0;
    if(e.key==='ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime-5);
    else audio.currentTime = Math.min((d||1e9), audio.currentTime+5);
  } else if(e.key==='Enter'){
    if(vrKeyTarget()) return;
    const btn = document.querySelector('[data-vr-save]');
    if(!btn) return;
    e.preventDefault(); btn.click();
  } else if(e.code==='Space' || e.key===' '){
    if(vrKeyTarget()) return;
    const pauseBtn = document.querySelector('[data-vr-pause]');
    if(pauseBtn){ e.preventDefault(); pauseBtn.click(); return; }
    const audio = document.querySelector('[data-vr-audio]');
    if(!audio) return;
    e.preventDefault();
    if(audio.paused) audio.play(); else audio.pause();
  } else if((e.key==='r' || e.key==='R') && !(e.metaKey || e.ctrlKey)){
    if(vrKeyTarget()) return;
    const btn = document.querySelector('[data-vr-rec-btn]');
    if(!btn || btn.disabled) return;
    e.preventDefault(); btn.click();
  } else if(e.key==='Escape'){
    if(vrKeyTarget()) return;
    const discardBtn = document.querySelector('[data-vr-discard]') || document.querySelector('[data-vr-discard-pending]');
    if(!discardBtn) return;
    e.preventDefault(); discardBtn.click();
  }
});

/* ---------------- из базы: разметка диктофона и сохранённой записи ---------------- */
// В отличие от базы в строке меты нет «виден ученику / только педагог»:
// видимость решает Николай, ученику эта пометка ни о чём.
function vrTakeMetaLine(t){
  const d = t.createdAt ? new Date(t.createdAt) : null;
  const dateStr = d ? (kbPad(d.getDate())+'.'+kbPad(d.getMonth()+1)+'.'+String(d.getFullYear()).slice(2)+' '+kbPad(d.getHours())+':'+kbPad(d.getMinutes())) : '';
  const sizeMatch = (t.meta||'').match(/([\d.,]+ ?(KB|MB))/i);
  const sizeStr = sizeMatch ? sizeMatch[1] : '';
  const dur = t.durationSec!=null ? vrFmtTime(t.durationSec) : '';
  return [dateStr, dur, sizeStr].filter(Boolean).join(' · ');
}
// opts.readOnly — запись «Стало» с урока: слушать, перематывать, переходить
// по пометкам, без правок. opts.canDelete — «Удалить» у своей записи.
function vrTakeRowDark(recKey, t, opts){
  opts = opts || {};
  const ro = !!opts.readOnly;
  const rk = recKey + '_' + t.id;
  const bars = vrDownsample(t.peaks, 90);
  const dur = t.durationSec || 0;
  const markers = vrSortedMarkers(t.markers);
  const pins = dur ? markers.map(m=>`<div class="vr-take-pin" style="left:${Math.min(100,Math.max(0,vrMarkerTime(m)/dur*100))}%;"></div>`).join('') : '';
  const chips = markers.map(m=>`<span class="vr-mk-chip" data-vr-marker-chip="${rk}" data-marker-id="${m.id}">${vrFmtTime(vrMarkerTime(m))}${m.label?(' '+esc(m.label)):''}${ro?'':`<span class="vr-mk-del" data-vr-marker-del="${rk}" data-marker-id="${m.id}">✕</span>`}</span>`).join('');
  const rateVals = [0.5,0.75,1,1.25,1.5,1.75,2];
  const rateBtns = rateVals.map(v=>`<button type="button" class="vr-tr-btn vr-rate-btn${v===1?' on':''}" data-vr-rate-btn="${rk}" data-rate="${v}">${v}×</button>`).join('');
  return `<div class="vr-take${t._fresh?' fresh':''}" data-vr-row="${rk}">
    <video data-vr-audio="${rk}" src="${t.dataUrl||''}" preload="metadata" playsinline webkit-playsinline style="display:none;"></video>
    <div class="vr-take-top">
      <button type="button" class="vr-tr-btn vr-tr-play" data-vr-play="${rk}" style="flex-shrink:0;">▶</button>
      <div class="vr-take-title" ${ro?'':`data-vr-title="${rk}" title="Нажми, чтобы переименовать"`} style="flex:1;min-width:0;">${esc(t.name||'')}</div>
      ${ro?'':'<div style="color:#8FBF8A;font-weight:700;font-size:12px;flex-shrink:0;">✓ Сохранено</div>'}
    </div>
    <div class="vr-take-meta">${vrTakeMetaLine(t)}</div>
    <div class="vr-take-wave" data-vr-waveform="${rk}" data-duration="${dur}">
      ${bars.map(v=>`<div class="vr-take-bar" style="height:${Math.max(2,Math.round(v*28))}px;"></div>`).join('')}
      ${pins}
    </div>
    <div class="vr-take-transport">
      <span class="vr-take-time" data-vr-time="${rk}">0:00 / ${vrFmtTime(dur)}</span>
      ${rateBtns}
      ${opts.canDelete?`<button type="button" class="vr-tr-btn" data-vr-delete="${rk}" style="margin-left:auto;">Удалить</button>`:''}
    </div>
    <div class="vr-take-markers" data-vr-marker-list="${rk}">${chips}</div>
  </div>`;
}
function vrRecorderHtml(recKey, rec, takes, opts){
  opts = opts || {};
  const takesArr = takes || [];
  const mm = kbPad(Math.floor(rec.seconds/60)), ss = kbPad(rec.seconds%60);
  let body = '';
  if(rec.pendingTake){
    const pt = rec.pendingTake;
    const mk = vrSortedMarkers(pt.markers);
    body = `<div class="vr-row"><div style="flex:1;min-width:200px;"><div class="vr-caption saved">Запись остановлена — ${pt.meta}</div></div><button type="button" class="vr-btn" data-vr-save="${recKey}">Сохранить</button><button type="button" class="vr-tr-btn" data-vr-discard-pending="${recKey}">Стереть</button></div>${mk.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${mk.map(m=>`<span class="vr-marker-chip">${vrFmtTime(vrMarkerTime(m))}${m.label?(' '+esc(m.label)):''}</span>`).join('')}</div>` : ''}${rec.error ? `<div class="vr-error">${rec.error}</div>` : ''}`;
  } else if(rec.saving){
    const phases = ['Сжимаем аудио','Загружаем в облако','Отправляем Николаю'];
    const phase = phases[Math.max(0,Math.min(2, rec.savingPhase||0))];
    const pct = Math.max(0, Math.min(100, rec.savingPct||0));
    body = `<div class="vr-row"><button type="button" class="vr-btn" disabled>■ Сохраняем</button><div class="vr-timer">00:00</div><div style="flex:1;min-width:180px;"><div class="vr-saving-phase"><span class="vr-spinner"></span>${phase}</div><div class="vr-progress-track"><div class="vr-progress-fill" style="width:${pct}%;"></div></div></div><div class="vr-saving-pct">${pct}%</div></div>`;
  } else if(rec.active){
    body = `<div class="vr-row"><button type="button" class="vr-btn active" data-vr-rec-btn="${recKey}">Стоп</button><div class="vr-dot"></div><div class="vr-timer live" data-vr-timer="${recKey}">${mm}:${ss}</div><div class="vr-bars" data-vr-bars="${recKey}">${Array.from({length:60}).map(()=>`<div class="vr-bar" style="height:3px;"></div>`).join('')}</div></div><div class="vr-ctl-row"><button type="button" class="vr-ctl-btn" data-vr-pause="${recKey}">${rec.paused?'Продолжить':'Пауза'}</button><button type="button" class="vr-ctl-btn danger" data-vr-discard="${recKey}">Стереть</button></div>${rec.error ? `<div class="vr-error">${rec.error}</div>` : ''}${rec.hint ? `<div class="vr-hint">${rec.hint}</div>` : ''}`;
  } else {
    body = `<div class="vr-row"><button type="button" class="vr-btn" data-vr-rec-btn="${recKey}" ${rec.saving?'disabled':''}>Записать</button><div style="flex:1;min-width:140px;"><div class="vr-caption">Запись голоса</div><div class="vr-timer" data-vr-timer="${recKey}">00:00</div></div><select class="vr-select" data-vr-device="${recKey}"><option value="">Микрофон по умолчанию</option></select>${opts.showUpload ? `<label class="vr-upload-label">Загрузить файл<input type="file" accept="audio/*" data-vr-upload="${recKey}" style="display:none;"></label>` : ''}</div>${rec.error ? `<div class="vr-error">${rec.error}</div>` : ''}`;
  }
  const takesHtml = takesArr.length ? `<div class="vr-takes-wrap" style="margin:14px -20px -18px -20px;padding:14px 20px 18px 20px;background:#231F1B;border-radius:0 0 16px 16px;display:flex;flex-direction:column;">${takesArr.map(t=> vrTakeRowDark(recKey, t, opts.takeOpts)).join('')}</div>` : '';
  return `<div class="vr-box">${body}${takesHtml}</div>`;
}

/* ---------------- из базы: движок записи ---------------- */
function dnUpdateRecDom(recKey, rec){
  const timerEl = document.querySelector(`[data-vr-timer="${recKey}"]`);
  if(timerEl){ timerEl.textContent = kbPad(Math.floor(rec.seconds/60)) + ':' + kbPad(rec.seconds%60); }
  const barsWrap = document.querySelector(`[data-vr-bars="${recKey}"]`);
  if(barsWrap){ const bars = barsWrap.children; const levels = rec.levels; for(let i=0;i<bars.length;i++){ const v = levels[levels.length - bars.length + i] || 0; bars[i].style.height = Math.max(3, Math.round(v*44)) + 'px'; } }
  const markerCountEl = document.querySelector(`[data-vr-marker="${recKey}"] .vr-marker-count`);
  if(markerCountEl) markerCountEl.textContent = (rec.markers||[]).length;
}
// В базе лимит ~4 МБ на запись; здесь запись идёт одним запросом через
// сервер Vercel (не больше 4,5 МБ), поэтому ~3 МБ звука.
var BYLO_MAX_DATAURL = 4200000;
function dnStartRecording(recKey, rec, opts){
  if(rec.active || rec.saving) return;
  if(!navigator.mediaDevices || !window.MediaRecorder){ rec.error = 'Телефон не даёт записать звук в этом окне. Обнови Telegram и попробуй снова.'; opts.onRepaint(); return; }
  const devSel = document.querySelector(`[data-vr-device="${recKey}"]`);
  const deviceId = (devSel && devSel.value) || vrDeviceId();
  const constraints = deviceId ? {audio:{deviceId:{exact:deviceId}}} : {audio:true};
  navigator.mediaDevices.getUserMedia(constraints).then(stream=>{
    rec.stream = stream;
    rec.hint = '';
    rec.silenceStreak = 0;
    vrRegisterRec(rec);
    const track = stream.getAudioTracks()[0];
    if(track){
      track.onended = ()=>{
        if(!rec.active) return;
        rec.paused = true;
        if(rec.mediaRecorder && rec.mediaRecorder.state==='recording' && rec.mediaRecorder.pause) rec.mediaRecorder.pause();
        rec.error = 'Микрофон отключён — выбери другой источник и продолжи.';
        opts.onRepaint();
      };
    }
    const mr = new MediaRecorder(stream);
    rec.chunks = [];
    mr.ondataavailable = e=>{ if(e.data && e.data.size) rec.chunks.push(e.data); };
    mr.onstop = ()=>{
      vrUnregisterRec(rec);
      if(rec._discard){ rec._discard = false; dnTeardownRecorder(rec); opts.onRepaint(); return; }
      const blob = new Blob(rec.chunks, {type: mr.mimeType || 'audio/webm'});
      const secs = rec.seconds;
      const d = new Date();
      const dateLabel = kbPad(d.getDate())+'.'+kbPad(d.getMonth()+1)+'.'+d.getFullYear();
      const fileName = dateLabel+'_'+opts.fileTag+'.webm';
      const displayName = (opts.studentName || 'Голос ученика') + ' · ' + dateLabel;
      const reader = new FileReader();
      reader.onload = ()=>{
        const dataUrl = reader.result;
        const wasLimitStop = !!rec._limitStop; rec._limitStop = false;
        const markers = vrSortedMarkers(rec.markers);
        const peaks = vrDownsample(rec.peaks, 200);
        const visibleToStudent = true;
        dnTeardownRecorder(rec);
        if(dataUrl.length > BYLO_MAX_DATAURL){ rec.error = 'Запись слишком большая для сохранения в базе (лимит ~3 МБ). Сократи её и запиши заново.'; opts.onRepaint(); return; }
        const take = { id: Date.now(), name: displayName, fileName: fileName, meta: kbPad(Math.floor(secs/60))+':'+kbPad(secs%60)+' · '+Math.round(blob.size/1024)+' KB', dataUrl, createdAt: new Date().toISOString(), durationSec: secs, markers, peaks, visibleToStudent };
        if(wasLimitStop){ opts.onSaveTake(take); } else { rec.pendingTake = take; opts.onRepaint(); }
      };
      reader.readAsDataURL(blob);
    };
    rec.mediaRecorder = mr;
    mr.start();
    rec.active = true; rec.paused = false; rec.seconds = 0; rec.error = ''; rec.levels = []; rec.peaks = []; rec.markers = []; rec.pendingTake = null;
    opts.onRepaint();
    rec.timer = setInterval(()=>{
      if(rec.paused) return;
      rec.seconds++;
      dnUpdateRecDom(recKey, rec);
    }, 1000);
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.65;
      ctx.createMediaStreamSource(stream).connect(analyser);
      rec.ctx = ctx;
      const data = new Uint8Array(analyser.fftSize);
      rec.levelTimer = setInterval(()=>{
        if(rec.paused) return;
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for(let i=0;i<data.length;i++){ const v = (data[i]-128)/128; sumSq += v*v; }
        const rms = Math.sqrt(sumSq/data.length);
        const amplitude = Math.min(1, rms*3.4);
        rec.levels = rec.levels.concat([amplitude]).slice(-60);
        rec.peaks.push(amplitude);
        if(amplitude < 0.02){ rec.silenceStreak = (rec.silenceStreak||0) + 1; } else { rec.silenceStreak = 0; if(rec.hint){ rec.hint=''; opts.onRepaint(); } }
        if(rec.silenceStreak === 200){ rec.hint = 'Похоже, микрофон не ловит звук.'; opts.onRepaint(); }
        dnUpdateRecDom(recKey, rec);
      }, 50);
    }catch(e){ /* визуализация не критична для работы записи */ }
  }).catch(()=>{ rec.error = 'Микрофон недоступен: разреши доступ к микрофону и попробуй снова.'; opts.onRepaint(); });
}
function dnStopRecording(rec){ if(rec.timer) clearInterval(rec.timer); if(rec.levelTimer) clearInterval(rec.levelTimer); if(rec.mediaRecorder && rec.mediaRecorder.state !== 'inactive') rec.mediaRecorder.stop(); else dnTeardownRecorder(rec); }
function dnTeardownRecorder(rec){ vrUnregisterRec(rec); if(rec.timer) clearInterval(rec.timer); if(rec.levelTimer) clearInterval(rec.levelTimer); if(rec.ctx){ try{ rec.ctx.close(); }catch(e){} rec.ctx = null; } if(rec.stream){ rec.stream.getTracks().forEach(t=>{ t.onended=null; t.stop(); }); rec.stream = null; } rec.active = false; rec.paused = false; rec.hint=''; rec.mediaRecorder = null; rec.timer = null; rec.levelTimer = null; }
function dnPauseToggle(rec, recKey, opts){ if(!rec.active) return; if(!rec.paused){ if(rec.mediaRecorder && rec.mediaRecorder.state==='recording' && rec.mediaRecorder.pause) rec.mediaRecorder.pause(); rec.paused = true; } else { if(rec.mediaRecorder && rec.mediaRecorder.state==='paused' && rec.mediaRecorder.resume) rec.mediaRecorder.resume(); rec.paused = false; rec.error=''; } opts.onRepaint(); }
function dnAddMarker(rec, recKey, opts){ if(!rec.active || rec.paused) return; rec.markers = rec.markers || []; rec.markers.push(vrNewMarker(rec.seconds)); opts.onRepaint(); }
function dnDiscardRecording(rec, opts){ if(!rec.active) return; if(rec.seconds > 10 && !confirm('Удалить текущую запись? Отменить будет нельзя.')) return; rec._discard = true; if(rec.mediaRecorder && rec.mediaRecorder.state !== 'inactive') rec.mediaRecorder.stop(); else dnTeardownRecorder(rec); opts.onRepaint(); }
function dnConfirmSaveTake(rec, opts){
  if(!rec.pendingTake || rec.saving) return;
  const take = rec.pendingTake;
  rec.pendingTake = null;
  rec.saving = true;
  rec.savingPhase = 0;
  rec.savingPct = 0;
  opts.onRepaint();
  const stepMs = 60;
  const steps = 22;
  let i = 0;
  const timer = setInterval(function(){
    i++;
    rec.savingPct = Math.min(100, Math.round(i/steps*100));
    rec.savingPhase = rec.savingPct >= 67 ? 2 : (rec.savingPct >= 34 ? 1 : 0);
    opts.onRepaint();
    if(i>=steps){
      clearInterval(timer);
      opts.onSaveTake(take);
    }
  }, stepMs);
}
function dnDiscardPendingTake(rec, opts){ rec.pendingTake = null; rec.markers = []; opts.onRepaint(); }

/* ---------------- из базы: пометки и сохранённая запись ---------------- */
function vrOpenMarkerEditor(rk, markerId, take, persistFn, repaintFn){
  const chip = document.querySelector('[data-vr-marker-chip="'+rk+'"][data-marker-id="'+markerId+'"]');
  if(!chip) return;
  const marker = (take.markers||[]).find(function(m){ return m.id===markerId; });
  if(!marker) return;
  const input = document.createElement('input');
  input.className = 'vr-mk-input';
  input.value = marker.label || '';
  input.placeholder = 'Что здесь?';
  input.maxLength = 200;
  chip.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = function(){
    if(done) return; done = true;
    const idx = vrSortedMarkers(take.markers).findIndex(function(m){ return m.id===markerId; });
    const v = input.value.trim().slice(0,200);
    marker.label = v || ('Метка ' + (idx+1));
    persistFn();
    repaintFn();
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ e.preventDefault(); finish(); }
    else if(e.key==='Escape'){ e.preventDefault(); input.value=''; finish(); }
  });
}
function vrWireTakeRow(root, rk, take, getTakes, setTakes, persistFn, repaintFn, isLight, readOnly){
  const audio = root.querySelector('[data-vr-audio="'+rk+'"]');
  const dur = take.durationSec || 0;
  if(audio){
    window.__vrAudios[rk] = audio;
    window.__vrTakeCtx = window.__vrTakeCtx || {};
    if(!readOnly) window.__vrTakeCtx[rk] = { take: take, persistFn: persistFn, repaintFn: repaintFn };
    const timeEl = root.querySelector('[data-vr-time="'+rk+'"]');
    const waveEl = root.querySelector('[data-vr-waveform="'+rk+'"]');
    const playBtn = root.querySelector('[data-vr-play="'+rk+'"]');
    const updateWave = function(){
      if(!waveEl) return;
      const d = dur || audio.duration || 0;
      if(!d) return;
      const pct = Math.min(1, audio.currentTime/d);
      const bars = waveEl.querySelectorAll(isLight?'.vr-light-bar':'.vr-take-bar');
      const cut = Math.floor(pct*bars.length);
      bars.forEach(function(b,i){ b.classList.toggle('played', i<cut); });
    };
    audio.addEventListener('timeupdate', function(){
      if(timeEl) timeEl.textContent = vrFmtTime(audio.currentTime) + ' / ' + vrFmtTime(dur||audio.duration||0);
      updateWave();
    });
    audio.addEventListener('play', function(){ vrStopOtherAudio(rk); if(playBtn) playBtn.textContent = '❚❚'; });
    audio.addEventListener('pause', function(){ if(playBtn) playBtn.textContent = '▶'; });
    audio.addEventListener('ended', function(){ if(playBtn) playBtn.textContent = '▶'; });
    if(playBtn) playBtn.onclick = function(){ if(audio.paused){ audio.play().catch(function(){}); } else { audio.pause(); } };
    const back5 = root.querySelector('[data-vr-back5="'+rk+'"]');
    if(back5) back5.onclick = function(){ audio.currentTime = Math.max(0, audio.currentTime-5); };
    const fwd5 = root.querySelector('[data-vr-fwd5="'+rk+'"]');
    if(fwd5) fwd5.onclick = function(){ audio.currentTime = Math.min((dur||audio.duration||1e9), audio.currentTime+5); };
    if(waveEl) waveEl.onclick = function(e){
      const rect = waveEl.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (e.clientX-rect.left)/rect.width));
      const d = dur || audio.duration || 0;
      audio.currentTime = pct*d;
    };
    if(waveEl && !readOnly) waveEl.ondblclick = function(e){
      const rect = waveEl.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (e.clientX-rect.left)/rect.width));
      const d = dur || audio.duration || 0;
      vrCreateOrEditMarker(rk, take, pct*d, persistFn, repaintFn);
    };
    const rateBtns = root.querySelectorAll('[data-vr-rate-btn="'+rk+'"]');
    if(rateBtns.length){
      rateBtns.forEach(function(b){
        b.onclick = function(){
          const v = parseFloat(b.getAttribute('data-rate'))||1;
          audio.playbackRate = v;
          rateBtns.forEach(function(x){ x.classList.toggle('on', x===b); });
        };
      });
    }
  }
  root.querySelectorAll('[data-vr-marker-chip="'+rk+'"]').forEach(function(chip){
    const markerId = chip.getAttribute('data-marker-id');
    chip.onclick = function(e){
      if(e.target.closest('[data-vr-marker-del]')) return;
      const a = window.__vrAudios[rk];
      const m = (take.markers||[]).find(function(x){ return x.id===markerId; });
      if(a && m) a.currentTime = vrMarkerTime(m);
    };
    if(!readOnly) chip.ondblclick = function(){ vrOpenMarkerEditor(rk, markerId, take, persistFn, repaintFn); };
  });
  if(readOnly) return;
  root.querySelectorAll('[data-vr-marker-del="'+rk+'"]').forEach(function(delBtn){
    delBtn.onclick = function(e){
      e.stopPropagation();
      const markerId = delBtn.getAttribute('data-marker-id');
      const prevMarkers = (take.markers||[]).slice();
      take.markers = (take.markers||[]).filter(function(m){ return m.id!==markerId; });
      persistFn();
      repaintFn();
      vrShowUndoToast('Метка удалена', function(){ take.markers = prevMarkers; persistFn(); repaintFn(); }, function(){});
    };
  });
  if(window.__vrPendingEditMarker && window.__vrPendingEditMarker.rk===rk){
    const pend = window.__vrPendingEditMarker;
    window.__vrPendingEditMarker = null;
    setTimeout(function(){ vrOpenMarkerEditor(rk, pend.markerId, take, persistFn, repaintFn); }, 0);
  }
  const titleEl = root.querySelector('[data-vr-title="'+rk+'"]');
  if(titleEl){
    titleEl.onclick = function(){
      const input = document.createElement('input');
      input.className = 'vr-take-title-input';
      input.value = take.name;
      titleEl.replaceWith(input);
      input.focus(); input.select();
      const fin = function(){ take.name = input.value.trim() || take.name; persistFn(); repaintFn(); };
      input.addEventListener('blur', fin);
      input.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); fin(); } if(e.key==='Escape'){ e.preventDefault(); repaintFn(); } });
    };
  }
  const delBtn = root.querySelector('[data-vr-delete="'+rk+'"]');
  if(delBtn){
    delBtn.onclick = function(){
      const all = getTakes();
      const idx = all.findIndex(function(x){ return x.id===take.id; });
      if(idx<0) return;
      const removed = all[idx];
      const next = all.slice(0,idx).concat(all.slice(idx+1));
      setTakes(next);
      repaintFn();
      vrShowUndoToast('Запись удалена', function(){ const cur=getTakes(); setTakes(cur.slice(0,idx).concat([removed]).concat(cur.slice(idx))); persistFn(); repaintFn(); }, function(){ persistFn(); });
    };
  }
}

/* ---------------- сервер: база (student-public) ---------------- */
function byloUrl(extra) { return BAZA_API + "/api/student-public?token=" + encodeURIComponent(state.accessToken) + extra; }
function byloPost(body) {
  return fetch(byloUrl(""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
}
function byloLoadAudio(which, take) {
  fetch(byloUrl("&part=bylo-audio&which=" + which)).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.blob();
  }).then(function (b) {
    take.dataUrl = URL.createObjectURL(b);
    var v = document.querySelector('[data-vr-audio="' + (which === "was" ? "bylo" : "byloNow") + "_" + take.id + '"]');
    if (v) v.src = take.dataUrl;
  }).catch(function () {});
}
function byloLoad() {
  if (BYLO.loading) return;
  BYLO.loading = true; BYLO.err = "";
  fetch(byloUrl("&part=bylo")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    BYLO.loading = false; BYLO.loaded = true;
    BYLO.was = j.was ? Object.assign({}, j.was) : null;
    BYLO.serverWasId = BYLO.was ? BYLO.was.id : null;
    BYLO.now = j.now ? Object.assign({}, j.now, { createdAt: j.now.createdAt }) : null;
    BYLO.nowDate = j.now ? j.now.date : null;
    if (BYLO.was) byloLoadAudio("was", BYLO.was);
    if (BYLO.now) byloLoadAudio("now", BYLO.now);
    byloRepaint();
  }).catch(function () {
    BYLO.loading = false; BYLO.err = "Не получилось загрузить записи. Проверь интернет и открой экран ещё раз.";
    byloRepaint();
  });
}
// Название и пометки своей записи; удаление (после 10 секунд «Отменить»).
function byloPersist() {
  if (BYLO.was && BYLO.serverWasId) {
    byloPost({ firstTakeEdit: { id: BYLO.serverWasId, name: BYLO.was.name, markers: BYLO.was.markers || [] } });
  } else if (!BYLO.was && BYLO.serverWasId) {
    var id = BYLO.serverWasId; BYLO.serverWasId = null;
    byloPost({ firstTakeDelete: { id: id } });
  }
}
function byloSendTake(take) {
  var body = { firstTake: { dataUrl: take.dataUrl, durationSec: take.durationSec, peaks: take.peaks } };
  var send = function () { return byloPost(body); };
  return send().then(function (j) {
    // Старую запись удалили, но 10 секунд «Отменить» ещё не прошли.
    if (j._status === 409 && !BYLO.was && BYLO.serverWasId) {
      var id = BYLO.serverWasId; BYLO.serverWasId = null;
      return byloPost({ firstTakeDelete: { id: id } }).then(send);
    }
    return j;
  }).then(function (j) {
    if (!j.ok) throw new Error(j.error || ("ошибка " + j._status));
    return j;
  });
}
function byloSaveTake(take, rec) {
  var p = byloSendTake(take);
  p.catch(function () {});
  return function () {
    p.then(function (j) {
      rec.saving = false;
      take.id = j.id; take.name = j.name; take.meta = j.meta || take.meta; take.createdAt = j.createdAt || take.createdAt;
      take.markers = take.markers || [];
      BYLO.was = take; BYLO.serverWasId = j.id;
      if ((take.markers || []).length) byloPersist();
      take._fresh = true;
      setTimeout(function () { take._fresh = false; byloRepaint(); }, 6000);
      byloRepaint();
    }).catch(function (err) {
      rec.saving = false; rec.pendingTake = take;
      rec.error = "Не удалось сохранить запись: " + (err.message || err) + ". Нажми «Сохранить» ещё раз.";
      byloRepaint();
    });
  };
}
// «Загрузить файл»: как в базе, файл целиком ложится в базу; волну и
// длительность считаем из самого файла, чтобы плеер показал запись.
function byloUploadFile(file) {
  var rec = BYLO.rec;
  var reader = new FileReader();
  reader.onload = function () {
    var dataUrl = reader.result;
    if (!/^data:(audio\/|application\/octet-stream)/.test(dataUrl)) { rec.error = "Это не аудиофайл. Выбери запись голоса."; byloRepaint(); return; }
    if (dataUrl.length > BYLO_MAX_DATAURL) { alert("Файл слишком большой для сохранения в базе (лимит ~3 МБ на запись). Загрузи файл покороче."); return; }
    var take = { id: Date.now(), name: file.name, meta: "загружено · " + Math.round(file.size / 1024) + " KB", dataUrl: dataUrl, createdAt: new Date().toISOString(), durationSec: 0, markers: [], peaks: [] };
    var done = function () { rec.pendingTake = take; rec.error = ""; dnConfirmSaveTake(rec, byloEngOpts()); };
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      var ctx = new C();
      file.arrayBuffer().then(function (buf) { return ctx.decodeAudioData(buf); }).then(function (ab) {
        var ch = ab.getChannelData(0), n = 200, step = Math.max(1, Math.floor(ch.length / n)), peaks = [];
        for (var i = 0; i < n; i++) { var m = 0; for (var k = i * step; k < Math.min(ch.length, (i + 1) * step); k += 16) m = Math.max(m, Math.abs(ch[k])); peaks.push(m); }
        take.peaks = vrDownsample(peaks, 200); take.durationSec = Math.round(ab.duration);
        try { ctx.close(); } catch (e) {}
        done();
      }).catch(function () { try { ctx.close(); } catch (e) {} done(); });
    } catch (e) { done(); }
  };
  reader.readAsDataURL(file);
}

/* ---------------- экран ---------------- */
function byloEngOpts() {
  return {
    fileTag: "pervaya-zapis", studentName: "Первая запись",
    onRepaint: byloRepaint,
    onSaveTake: function (take) { byloSaveTake(take, BYLO.rec)(); }
  };
}
function byloDateLong(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  var m = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return d.getDate() + " " + m[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}
function byloHtml() {
  if (!BYLO.rec) BYLO.rec = vrBlankRec();
  var rec = BYLO.rec;
  var head = cabBack() + '<div class="cab-screen-title">Было и стало</div>' +
    '<p class="pt-intro" style="font:500 13px/1.5 Inter,sans-serif;color:var(--tx3);margin:-4px 0 14px;">Послушай, как вырос твой голос</p>';
  if (!BYLO.loaded) {
    return head + '<div class="bs-empty">' + (BYLO.err ? esc(BYLO.err) : "Загружаю записи…") + "</div>";
  }
  var wasInner;
  if (BYLO.was && !rec.active && !rec.pendingTake && !rec.saving) {
    wasInner = '<div class="vr-box">' + vrTakeRowDark("bylo", BYLO.was, { canDelete: true }) + "</div>";
  } else {
    wasInner = vrRecorderHtml("bylo", rec, [], { showUpload: true });
  }
  var wasCard = '<div class="bs-card"><div class="bs-card-top"><span class="bs-chip was">Было</span>' +
    '<span class="bs-date">' + (BYLO.was ? byloDateLong(BYLO.was.createdAt) : "") + "</span></div>" + wasInner + "</div>";
  var nowInner = BYLO.now
    ? '<div class="vr-box">' + vrTakeRowDark("byloNow", BYLO.now, { readOnly: true }) + "</div>"
    : '<div class="bs-empty">Здесь появится запись с урока, когда Николай откроет её тебе.</div>';
  var nowCard = '<div class="bs-card"><div class="bs-card-top"><span class="bs-chip now">Стало</span>' +
    '<span class="bs-date">' + (BYLO.now ? byloDateLong(BYLO.nowDate) : "") + "</span></div>" + nowInner + "</div>";
  var both = '<button class="bs-both" data-bs-both ' + (BYLO.was && BYLO.now ? "" : "disabled") + ">" +
    (BYLO.seq ? "Остановить" : "Послушать подряд: было, потом стало") + "</button>";
  return head + wasCard + nowCard + both;
}
// Перерисовка не прерывает звук: запоминаем, что играло и с какого места.
var byloPainting = false;
function byloRepaint() {
  if (state.screen !== "bylo") return;
  // Поле пометки, теряя фокус при перерисовке, само зовёт перерисовку.
  if (byloPainting) { setTimeout(byloRepaint, 0); return; }
  byloPainting = true;
  try { byloRepaintNow(); } finally { byloPainting = false; }
}
function byloRepaintNow() {
  var playing = {};
  Object.keys(window.__vrAudios).forEach(function (k) {
    var a = window.__vrAudios[k];
    if (a && a.isConnected) { playing[k] = { t: a.currentTime, on: !a.paused, rate: a.playbackRate }; if (!a.paused) a.pause(); }
  });
  app.innerHTML = '<div class="bs" style="padding:var(--screen-top) 16px 130px;">' + byloHtml() + "</div>";
  wireActs();
  byloWire(playing);
}
function byloWire(playing) {
  var root = app;
  var rec = BYLO.rec;
  var eng = byloEngOpts();
  window.__vrAudios = {};
  var btn = root.querySelector('[data-vr-rec-btn="bylo"]');
  if (btn) btn.onclick = function () { if (rec.active) { dnStopRecording(rec); } else { dnStartRecording("bylo", rec, eng); } };
  var pauseBtn = root.querySelector('[data-vr-pause="bylo"]');
  if (pauseBtn) pauseBtn.onclick = function () { dnPauseToggle(rec, "bylo", eng); };
  var discardBtn = root.querySelector('[data-vr-discard="bylo"]');
  if (discardBtn) discardBtn.onclick = function () { dnDiscardRecording(rec, eng); };
  var saveBtn = root.querySelector('[data-vr-save="bylo"]');
  if (saveBtn) saveBtn.onclick = function () { dnConfirmSaveTake(rec, eng); };
  var discardPendingBtn = root.querySelector('[data-vr-discard-pending="bylo"]');
  if (discardPendingBtn) discardPendingBtn.onclick = function () { dnDiscardPendingTake(rec, eng); };
  var deviceSel = root.querySelector('[data-vr-device="bylo"]');
  if (deviceSel) { vrListInputDevices(deviceSel); deviceSel.onchange = function () { vrSetDeviceId(deviceSel.value); }; }
  var uploadInput = root.querySelector('[data-vr-upload="bylo"]');
  if (uploadInput) uploadInput.onchange = function (e) { var file = e.target.files && e.target.files[0]; if (file) byloUploadFile(file); e.target.value = ""; };
  var getTakes = function () { return BYLO.was ? [BYLO.was] : []; };
  var setTakes = function (next) { BYLO.was = next[0] || null; };
  if (BYLO.was) vrWireTakeRow(root, "bylo_" + BYLO.was.id, BYLO.was, getTakes, setTakes, byloPersist, byloRepaint, false, false);
  if (BYLO.now) vrWireTakeRow(root, "byloNow_" + BYLO.now.id, BYLO.now, function () { return [BYLO.now]; }, function () {}, function () {}, byloRepaint, false, true);
  Object.keys(playing || {}).forEach(function (k) {
    var a = window.__vrAudios[k], p = playing[k];
    if (!a) return;
    var go = function () { a.currentTime = p.t; a.playbackRate = p.rate || 1; if (p.on) a.play().catch(function () {}); };
    if (a.readyState >= 1) go(); else a.addEventListener("loadedmetadata", go, { once: true });
  });
  var both = root.querySelector("[data-bs-both]");
  if (both) both.onclick = byloPlayBoth;
}
function byloPlayBoth() {
  var a1 = BYLO.was && window.__vrAudios["bylo_" + BYLO.was.id];
  var a2 = BYLO.now && window.__vrAudios["byloNow_" + BYLO.now.id];
  if (!a1 || !a2) return;
  if (BYLO.seq) { BYLO.seq = false; a1.pause(); a2.pause(); byloRepaint(); return; }
  BYLO.seq = true;
  Object.keys(window.__vrAudios).forEach(function (k) { var a = window.__vrAudios[k]; if (a && !a.paused) a.pause(); });
  byloRepaint();
  a1 = window.__vrAudios["bylo_" + BYLO.was.id];
  a2 = window.__vrAudios["byloNow_" + BYLO.now.id];
  a2.pause(); a2.currentTime = 0;
  a1.currentTime = 0;
  a1.onended = function () {
    a1.onended = null;
    if (!BYLO.seq) return;
    a2.currentTime = 0;
    a2.onended = function () { a2.onended = null; BYLO.seq = false; byloRepaint(); };
    a2.play().catch(function () {});
  };
  a1.play().catch(function () {});
}
function renderByloScreen() {
  if (!BYLO.loaded && !BYLO.loading) byloLoad();
  app.innerHTML = '<div class="bs" style="padding:var(--screen-top) 16px 130px;">' + byloHtml() + "</div>";
  wireActs();
  if (BYLO.loaded) byloWire({});
}
// Уход с экрана: звук на паузу; идущая запись останавливается и ждёт
// «Сохранить / Стереть», когда ученик вернётся.
window.byloStopAll = function () {
  Object.keys(window.__vrAudios || {}).forEach(function (k) { var a = window.__vrAudios[k]; if (a && !a.paused) a.pause(); });
  BYLO.seq = false;
  if (state.screen !== "bylo" && BYLO.rec && BYLO.rec.active) dnStopRecording(BYLO.rec);
};
ACTS["cab-bylo"] = function () { BYLO.loaded = false; go("bylo"); };
