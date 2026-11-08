import { getSupabaseClient, invokePublicFunction, getBeijingDate } from './supabase.js';
import { getMember } from './auth.js';
import { loadHome, updateVersioned, saveItem, deleteItem, mediaUrl, clearMedia, uploadMedia, removeMedia, addPhoto, deletePhoto, appointmentSummary, togetherDays, CONFLICT } from './home-data.js';

const $ = selector => document.querySelector(selector);
const state = {member:null, data:null, route:'home', tab:'pending', busy:false, loaded:false, setup:false};
let toastTimer, refreshPromise, dayTimer;
function updateTogetherDays() {
  clearTimeout(dayTimer);
  const today=getBeijingDate();
  document.querySelectorAll('[data-together-days]').forEach(n=>n.textContent=togetherDays(today));
  const now=new Date();
  $('#todayMonth').textContent=new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'Asia/Shanghai'}).format(now).toUpperCase();
  $('#todayDay').textContent=today.slice(-2);
  $('#todayWeek').textContent=new Intl.DateTimeFormat('zh-CN',{weekday:'long',timeZone:'Asia/Shanghai'}).format(now);
  if(state.data)renderRoom();
  const nextMidnight=Date.parse(`${today}T00:00:00+08:00`)+86400000;
  dayTimer=setTimeout(updateTogetherDays,Math.max(1000,nextMidnight-Date.now()+50));
}
updateTogetherDays();
const pendingFiles=[];
const cleanupPaths=new Set();
const tokenKey='mood_station_access_token';
const url=new URL(location.href);
let setupToken=url.searchParams.get('token') || '';
try {if(setupToken) sessionStorage.setItem(tokenKey,setupToken);else setupToken=sessionStorage.getItem(tokenKey)||'';} catch {}
if(url.searchParams.has('token')) {url.searchParams.delete('token');history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`);}
const returnTo=url.searchParams.get('return');
$('#setupToggle').hidden=!setupToken;

function el(tag, className='', text='') {const n=document.createElement(tag);if(className)n.className=className;if(text)n.textContent=text;return n;}
function action(text, handler, className='secondary') {const b=el('button',className,text);b.type='button';b.addEventListener('click',()=>run(b,handler));return b;}
function toast(message) {clearTimeout(toastTimer);$('#homeToast').textContent=message;$('#homeToast').hidden=false;toastTimer=setTimeout(()=>$('#homeToast').hidden=true,5000);}
function friendly(error) {
  if(!navigator.onLine) return '网络暂时断开了。已填写的内容还在，连上后再试一次。';
  if(error?.message===CONFLICT) return CONFLICT;
  if(/jwt|session|unauthorized/i.test(error?.message||'')) return '登录已过期，请退出后重新登录。';
  if(error instanceof Error && !/fetch|network/i.test(error.message)) return error.message;
  return '这次没有保存成功，内容已保留，请稍后重试。';
}
async function run(button,fn) {if(button.disabled)return;button.disabled=true;try{await fn();}catch(e){toast(friendly(e));}finally{button.disabled=false;}}
async function confirmRemoval(title,text) {$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;const d=$('#confirmDialog');d.returnValue='cancel';d.showModal();return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true}));}
function field(label,type,name,value='',maxLength) {const wrap=el('label','field');wrap.append(el('span','',label));const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.name=name;input.value=value||'';if(maxLength)input.maxLength=maxLength;wrap.append(input);return {wrap,input};}
function imageInto(parent,path,alt,className='') {parent.dataset.mediaPath=path;const img=el('img',className);img.alt=alt;img.loading='lazy';mediaUrl(path).then(src=>{if(parent.isConnected&&parent.dataset.mediaPath===path){img.src=src;parent.replaceChildren(img);}}).catch(()=>{if(parent.isConnected&&parent.dataset.mediaPath===path)parent.textContent='照片暂时没加载出来';});}

$('#togglePassword').addEventListener('click',()=>{const i=$('#homePassword');i.type=i.type==='password'?'text':'password';$('#togglePassword').textContent=i.type==='password'?'显示':'隐藏';$('#togglePassword').setAttribute('aria-label',i.type==='password'?'显示密码':'隐藏密码');});
$('#setupToggle').addEventListener('click',()=>{
  state.setup=!state.setup;
  $('#setupHint').hidden=!state.setup;$('#setupConfirmLabel').hidden=!state.setup;$('#setupConfirm').required=state.setup;
  $('#setupToggle').textContent=state.setup?'已经有密码？返回登录':'第一次回家？设置小萱的密码';
  $('#loginSubmit').textContent=state.setup?'设置密码，回到小家 →':'开门回家 →';
  $('#homePassword').autocomplete=state.setup?'new-password':'current-password';
  $('#homePassword').minLength=state.setup?10:1;
  $('input[value="xiaoxuan"]').checked=true;
  $('input[value="zhang"]').disabled=state.setup;
  $('#loginError').textContent='';
});
$('#homeLogin').addEventListener('submit',async event=>{
  event.preventDefault();const b=$('#loginSubmit');if(b.disabled)return;b.disabled=true;$('#loginError').textContent='';
  try {
    const values=new FormData(event.currentTarget);
    if(state.setup&&values.get('password')!==$('#setupConfirm').value)throw new Error('两次密码不一致，再确认一下吧。');
    const session=await invokePublicFunction('home-account',{action:state.setup?'setup':'login',profile:values.get('profile'),password:values.get('password'),...(state.setup?{token:setupToken}:{})});
    const {error}=await getSupabaseClient().auth.setSession(session);if(error)throw error;
    const member=await getMember();if(!member)throw new Error('这个身份还没有小家的访问权限。');
    $('#homePassword').value='';$('#setupConfirm').value='';
    if(state.setup){setupToken='';try{sessionStorage.removeItem(tokenKey);}catch{}}
    await enterHome(member);
  } catch(e){$('#loginError').textContent=friendly(e);}finally{b.disabled=false;}
});
$('#logout').addEventListener('click',()=>run($('#logout'),async()=>{
  if(state.busy) {toast('正在保存，稍等一下再退出。');return;}
  const {error}=await getSupabaseClient().auth.signOut({scope:'local'});if(error)throw error;
  await clearMedia();location.replace('index.html');
}));
$('#refreshHome').addEventListener('click',()=>run($('#refreshHome'),async()=>{await refresh();toast('小家已经刷新啦。');}));
document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.route==='mood')location.href='mood.html';else location.hash=b.dataset.route;}));
window.addEventListener('hashchange',()=>{state.tab='pending';renderRoute();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateTogetherDays();if(!document.hidden&&state.member&&!state.busy)refresh(false).catch(()=>{});});
window.addEventListener('online',()=>{if(state.member)refresh(false).catch(()=>{});});
$('#closePhoto').addEventListener('click',()=>$('#photoDialog').close());
$('#photoDialog').addEventListener('click',e=>{if(e.target===$('#photoDialog'))$('#photoDialog').close();});
window.addEventListener('beforeunload',event=>{if(state.busy){event.preventDefault();event.returnValue='';}});

async function enterHome(member) {
  state.member=member;
  if(['mood.html','history.html','admin.html'].includes(returnTo)){location.replace(returnTo);return;}
  $('#loginView').hidden=true;$('#homeView').hidden=false;$('#memberName').textContent=member.profile==='xiaoxuan'?'小萱，欢迎回家':'张先森，欢迎回家';
  const now=new Date();$('#todayMonth').textContent=new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'Asia/Shanghai'}).format(now).toUpperCase();$('#todayDay').textContent=getBeijingDate().slice(-2);$('#todayWeek').textContent=new Intl.DateTimeFormat('zh-CN',{weekday:'long',timeZone:'Asia/Shanghai'}).format(now);
  renderRoute();await refresh();
}
async function refresh(rerender=true) {
  if(refreshPromise) return refreshPromise;
  refreshPromise=(async()=>{try{state.data=await loadHome();state.loaded=true;$('#loadNotice').hidden=true;renderRoom();if(rerender)renderRoute();$('#homeView').dataset.ready='true';}
  catch(e){const notice=$('#loadNotice');notice.hidden=false;notice.replaceChildren(el('span','',state.loaded?'暂时没有刷新成功，当前显示上次读取的内容。':'小家暂时没有连上，稍后再试一下。'),action('重新连接',()=>refresh(),'text-button'));throw e;}
  finally{refreshPromise=null;}})();
  return refreshPromise;
}
function renderRoom() {
  if(!state.data)return;
  const {date,items,photos,frame}=state.data;
  const summary=appointmentSummary(date);$('#calendarDay').textContent=summary.day;$('#calendarSummary').textContent=summary.text;
  $('#foodPreview').textContent=items.find(i=>i.kind==='food'&&!i.done)?.name||'想吃点什么？';
  const place=items.find(i=>i.kind==='place'&&!i.done);$('#placePreview').textContent=place?.name||'一起去看看世界';
  const art=$('#placeArt');art.dataset.mediaPath='';art.replaceChildren(el('span','hill'),el('span','postcard-sun'));if(place?.image_path)imageInto(art,place.image_path,place.name);
  const photo=photos.find(p=>p.id===frame.photo_id);const holder=$('#frameImage');holder.dataset.mediaPath='';
  if(photo)imageInto(holder,photo.path,'挂在墙上的合照');else{const empty=el('span','empty-frame');empty.append(el('i','','♡'),el('span','','放一张我们的照片'));holder.replaceChildren(empty);}
}
function renderRoute() {
  if(!state.member)return;
  const route=location.hash.slice(1);state.route=['date','food','place','album'].includes(route)?route:'home';
  $('#roomView').hidden=state.route!=='home';$('#detailView').hidden=state.route==='home';
  if(state.route==='home'){renderRoom();return;}
  const copy={date:['下次约会','OUR NEXT DATE','把想见你的日子，认真记下来。'],food:['想吃清单','A LITTLE TASTE OF US','随口说过的“想吃”，我们都记得。'],place:['想去的地方','SOMEWHERE WITH YOU','远方也好，街角也好，和你一起就好。'],album:['我们的相册','LITTLE MOMENTS, BIG LOVE','收藏一起走过的日常，挑一张挂在墙上。']}[state.route];
  $('#detailTitle').textContent=copy[0];$('#detailEyebrow').textContent=copy[1];$('#detailSubtitle').textContent=copy[2];
  if(!state.loaded){const c=$('#detailContent');c.replaceChildren(el('p','empty-state','正在打开我们的记录…'),action('重新读取',()=>refresh()));return;}
  $('#detailContent').replaceChildren();
  if(state.route==='date')renderDate();else if(state.route==='album')renderAlbum();else renderItems(state.route);
  $('#detailTitle').focus({preventScroll:true});
}

function renderDate() {
  let record={...state.data.date};
  const form=el('form','form-card');const status=el('p','detail-status',record.date?(record.date<getBeijingDate()?'这次约定的日期已经过去，可以修改日期或清空后约下一次。':appointmentSummary(record).text):'先选好哪天见，时间和地点可以慢慢商量。');form.append(status);
  const grid=el('div','form-grid');const date=field('见面的日子','date','date',record.date);date.input.required=true;const time=field('几点见 · 选填','time','time',record.time?.slice(0,5));const place=field('在哪里见 · 选填','text','place',record.place,200);place.wrap.classList.add('full');const note=field('那天的安排 · 选填','textarea','note',record.note,1000);note.wrap.classList.add('full');grid.append(date.wrap,time.wrap,place.wrap,note.wrap);form.append(grid);
  const error=el('p','error');error.setAttribute('role','alert');form.append(error);
  const conflict=el('div');conflict.hidden=true;form.append(conflict);
  const actions=el('div','form-actions');const clear=action('清空这次约定',async()=>{
    if(!await confirmRemoval('清空这次约定？','挂历会留白，等我们约好下一次见面。'))return;
    try{await updateVersioned('home_date',true,record.version,{date:null,time:null,place:'',note:''});await refresh();toast('挂历清空啦，期待下一次见面。');}catch(e){error.textContent=friendly(e);}
  });clear.hidden=!record.date;
  const save=el('button','primary','记到挂历上');save.type='submit';actions.append(clear,save);form.append(actions);
  form.addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;state.busy=true;save.disabled=true;clear.disabled=true;save.textContent='正在记下来…';error.textContent='';
    try{await updateVersioned('home_date',true,record.version,{date:date.input.value,time:time.input.value||null,place:place.input.value.trim(),note:note.input.value.trim()});await refresh();toast('挂历已经更新啦。');}
    catch(e){error.textContent=friendly(e);if(e.message===CONFLICT){conflict.hidden=false;conflict.replaceChildren(action('查看最新约定（保留我的输入）',async()=>{await refresh(false);record={...state.data.date};const d=record.date;status.textContent=d?`对方最新保存：${d} ${record.time?.slice(0,5)||''}；${record.place||'未填地点'}；${record.note||'未填安排'}。下方仍是你的输入，再次保存将使用下方内容。`:'对方已经清空约定。下方保留你的输入。';conflict.hidden=true;}));}}
    finally{state.busy=false;save.disabled=false;clear.disabled=false;save.textContent='记到挂历上';}
  });$('#detailContent').append(form);
}

function renderItems(kind) {
  const isFood=kind==='food';const root=$('#detailContent');const formHolder=el('div');root.append(formHolder);
  const toolbar=el('div','list-toolbar');const tabs=el('div','tabs');for(const [key,name] of [['pending',isFood?'想吃':'想去'],['done',isFood?'吃过了':'去过了']]){const b=action(name,async()=>{state.tab=key;drawList();},state.tab===key?'active':'');b.dataset.tab=key;tabs.append(b);}toolbar.append(tabs,action(isFood?'＋ 记下想吃的':'＋ 收藏一个地方',async()=>openForm(null),'text-button'));root.append(toolbar);const list=el('div','item-list');root.append(list);
  function drawList(){tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));list.replaceChildren();const items=state.data.items.filter(i=>i.kind===kind&&i.done===(state.tab==='done'));if(!items.length){list.append(el('div','empty-state',state.tab==='done'?'一起完成的小心愿，会留在这里。':isFood?'下次想吃什么？先记下第一个小心愿吧。':'想和你去的地方，从这里开始。'));return;}
    for(const item of items){const card=el('article','item-card');if(item.image_path){const box=el('div');card.append(box);imageInto(box,item.image_path,item.name,'item-image');}const copy=el('div','item-copy');copy.append(el('h3','',item.name));if(item.address)copy.append(el('p','',item.address));if(item.note)copy.append(el('p','',item.note));const actions=el('div','item-actions');actions.append(action(item.done?'移回心愿清单':isFood?'✓ 吃过啦':'✓ 去过啦',async()=>{await updateVersioned('home_items',item.id,item.version,{done:!item.done});await refresh(false);drawList();toast(item.done?'又放回心愿清单啦。':'又多了一份共同回忆。');},'done-toggle'),action('编辑',async()=>openForm(item),''),action('移除',async()=>{if(await confirmRemoval(`移除“${item.name}”？`,'移除后，这条心愿将不再出现在清单里。')){try{await deleteItem(item);}finally{await refresh(false);drawList();}}},'remove'));copy.append(actions);card.append(copy);list.append(card);}}
  function openForm(original){let editing=original?{...original}:null;const draftId=crypto.randomUUID();let uploadedPath=null;let selectedFile=null;let removeImage=false;
    formHolder.replaceChildren();const form=el('form','form-card');const grid=el('div','form-grid');const name=field(isFood?'想吃什么？':'想去哪里？','text','name',editing?.name,100);name.input.required=true;name.wrap.classList.add('full');name.input.placeholder=isFood?'比如：烤肉、学校门口的面馆':'比如：南京、街角的那家书店';const address=field('位置 · 选填','text','address',editing?.address,300);address.wrap.classList.add('full');const note=field('想说的话 · 选填','textarea','note',editing?.note,1000);note.wrap.classList.add('full');grid.append(name.wrap,address.wrap,note.wrap);
    if(!isFood){const pic=field('配一张图片 · 选填','file','image');pic.input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';pic.wrap.classList.add('full');pic.input.addEventListener('change',()=>{selectedFile=pic.input.files[0]||null;uploadedPath=null;removeImage=false;});pic.wrap.append(el('small','file-hint','选不选图片都可以，文字也会成为一张明信片。'));if(editing?.image_path){const preview=el('div');pic.wrap.append(preview);imageInto(preview,editing.image_path,'已有配图','image-preview');pic.wrap.append(action('移除这张配图',async()=>{removeImage=true;selectedFile=null;pic.input.value='';preview.replaceChildren();},'text-button'));}grid.append(pic.wrap);}
    const error=el('p','error');error.setAttribute('role','alert');const conflict=el('div');const actions=el('div','form-actions');const cancel=action('收起',async()=>{formHolder.replaceChildren();if(uploadedPath)await removeMedia(uploadedPath).catch(()=>{});},'secondary');const save=el('button','primary',editing?'保存修改':isFood?'贴到冰箱上':'钉到软木板上');save.type='submit';actions.append(cancel,save);form.append(grid,error,conflict,actions);formHolder.append(form);name.input.focus();
    form.addEventListener('submit',async e=>{e.preventDefault();if(state.busy)return;if(!name.input.value.trim()){error.textContent='先写一个名字吧。';return;}state.busy=true;save.disabled=true;cancel.disabled=true;save.textContent='正在保存…';error.textContent='';
      try{if(selectedFile&&!uploadedPath){save.textContent='正在上传图片…';uploadedPath=await uploadMedia(selectedFile,state.member.user.id);}const patch={kind,name:name.input.value.trim(),address:address.input.value.trim(),note:note.input.value.trim(),image_path:removeImage?null:uploadedPath||editing?.image_path||null};const oldPath=editing?.image_path;await saveItem(editing,editing?patch:{...patch,id:draftId});if(oldPath&&oldPath!==patch.image_path){try{await removeMedia(oldPath);}catch{cleanupPaths.add(oldPath);}}uploadedPath=null;formHolder.replaceChildren();await refresh(false);drawList();toast('记到我们的小家里啦。');}
      catch(e){error.textContent=friendly(e);if(e.message===CONFLICT){conflict.replaceChildren(action('查看对方最新内容',async()=>{await refresh(false);const latest=state.data.items.find(i=>i.id===editing.id);if(!latest){error.textContent='这条心愿已被对方移除。你的输入仍在，收起后可以重新添加。';return;}editing={...latest};error.textContent=`对方保存了：${latest.name}；${latest.address||'未填位置'}；${latest.note||'未填备注'}。下方保留你的输入，再次保存将使用你的内容。`;conflict.replaceChildren();}));}}
      finally{state.busy=false;save.disabled=false;cancel.disabled=false;save.textContent='保存到小家';}
    });}
  drawList();if(!state.data.items.some(i=>i.kind===kind))openForm(null);
}

function renderAlbum() {
  const root=$('#detailContent');const toolbar=el('div','album-tools');const label=el('label','upload-label primary','＋ 添加照片');const input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';input.multiple=true;label.append(input);toolbar.append(label,el('span','muted',`${state.data.photos.length} 张一起收藏的日常`));root.append(toolbar);
  const status=el('p','photo-progress');status.setAttribute('role','status');root.append(status);const retry=action('重试未上传的照片',()=>uploadPending(),'secondary');retry.hidden=!pendingFiles.length;root.append(retry);
  const clean=action('重试清理已移除的照片',async()=>{for(const path of [...cleanupPaths]){await removeMedia(path);cleanupPaths.delete(path);}clean.hidden=true;toast('照片文件已清理。');});clean.hidden=!cleanupPaths.size;root.append(clean);
  const grid=el('div','album-grid');root.append(grid);const photos=state.data.photos;if(!photos.length)root.append(el('div','empty-state','从一张照片开始，慢慢装满我们的小家。'));
  for(const photo of photos){const card=el('article','photo-card');const open=action('',async()=>{const src=await mediaUrl(photo.path);$('#largePhoto').src=src;$('#photoCaption').textContent=photo.title||'和你一起的小日常';$('#photoDialog').showModal();},'photo-open');open.setAttribute('aria-label','查看照片大图');card.append(open);imageInto(open,photo.path,'我们收藏的照片');const actions=el('div','item-actions');const selected=state.data.frame.photo_id===photo.id;
    const wall=action(selected?'♡ 正在墙上':'挂到墙上',async()=>{await updateVersioned('home_frame',true,state.data.frame.version,{photo_id:photo.id});await refresh();toast('这张照片，挂到墙上啦。');},selected?'on-wall':'');wall.disabled=selected;
    actions.append(wall,action('移除',async()=>{if(!await confirmRemoval('移除这张照片？','如果它正在墙上，相框会换成相册里的另一张。'))return;try{await deletePhoto(photo);}catch(e){if(e.cleanupPath)cleanupPaths.add(e.cleanupPath);throw e;}finally{await refresh();}},'remove'));card.append(actions);grid.append(card);}
  input.addEventListener('change',async()=>{if(state.busy)return;pendingFiles.push(...input.files);input.value='';await uploadPending();});
  async function uploadPending(){if(state.busy)return;state.busy=true;input.disabled=true;retry.disabled=true;status.classList.remove('photo-error');let count=0;const total=pendingFiles.length;
    try{while(pendingFiles.length){status.textContent=`正在上传第 ${count+1} / ${total} 张，稍等一下…`;await addPhoto(pendingFiles[0],state.member.user.id);pendingFiles.shift();count++;}await refresh();toast(`已经收好 ${count} 张照片啦。`);}
    catch(e){status.classList.add('photo-error');status.textContent=`${count?`已上传 ${count} 张。`:''}${friendly(e)} 未上传的照片仍保留，可以重试。`;retry.hidden=false;await refresh(false).catch(()=>{});}
    finally{state.busy=false;input.disabled=false;retry.disabled=false;}
  }
}

(async()=>{try{const member=await getMember();if(member)await enterHome(member);}catch(e){$('#loginError').textContent='暂时连不上小家，请检查网络后重新登录。';}try{getSupabaseClient().auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&state.member){clearMedia();location.replace('index.html');}});}catch{}})();
