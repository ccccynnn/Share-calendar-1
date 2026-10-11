/* Ribbon Days: local-first PWA scaffold. Configure Supabase for cloud sync. */
const $ = (id) => document.getElementById(id);
const LOCAL_KEY = "ribbon-days-events-v1";
const SETTINGS_KEY = "ribbon-days-settings-v1";
let current = new Date(); current.setDate(1);
let selectedDate = isoDate(new Date());
let events = [];
let supabaseClient = null;
let currentUser = null;

function isoDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function localLoad(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"[]")}catch{return []}}
function localSave(){localStorage.setItem(LOCAL_KEY,JSON.stringify(events))}
function setStatus(text,online=false){$("syncStatus").textContent=text;$("syncStatus").classList.toggle("online",online)}
function monthName(d){return `${d.getFullYear()} 年 ${d.getMonth()+1} 月`}
function dateLabel(s){const d=new Date(`${s}T12:00:00`);return `${d.getMonth()+1}/${d.getDate()}（${["日","一","二","三","四","五","六"][d.getDay()]}）`}
function timeRange(e){return `${e.start_time||"全天"} – ${e.end_time||""}`}
function normalizeRow(r){return {id:r.id,name:r.title||r.name,type:r.event_type||r.type,date:r.event_date||r.date,start_time:r.start_time,end_time:r.end_time,notes:r.notes||"",updated_at:r.updated_at};}
function toDb(e){return {id:e.id,user_id:currentUser.id,title:e.name,event_type:e.type,event_date:e.date,start_time:e.start_time,end_time:e.end_time,notes:e.notes||"",updated_at:new Date().toISOString()};}

function render(){
  $("monthLabel").textContent=monthName(current);
  const first=new Date(current.getFullYear(),current.getMonth(),1), offset=first.getDay(), days=new Date(current.getFullYear(),current.getMonth()+1,0).getDate();
  const prevDays=new Date(current.getFullYear(),current.getMonth(),0).getDate();
  const today=isoDate(new Date()); let html="";
  for(let i=0;i<42;i++){
    let day, date, muted=false;
    if(i<offset){day=prevDays-offset+i+1;date=isoDate(new Date(current.getFullYear(),current.getMonth()-1,day));muted=true}
    else if(i>=offset+days){day=i-offset-days+1;date=isoDate(new Date(current.getFullYear(),current.getMonth()+1,day));muted=true}
    else {day=i-offset+1;date=isoDate(new Date(current.getFullYear(),current.getMonth(),day))}
    const dayEvents=events.filter(e=>e.date===date).sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||""));
    html+=`<button class="calendar-day ${muted?"muted":""} ${date===today?"today":""} ${date===selectedDate?"selected":""}" data-date="${date}"><span class="day-number">${day}</span>${dayEvents.length?'<span class="day-bow">🎀</span>':""}<div>${dayEvents.slice(0,2).map(e=>`<div class="day-event ${e.type==="overtime"?"overtime":""}">${escapeHtml(e.name)}</div>`).join("")}${dayEvents.length>2?`<div class="day-event">＋${dayEvents.length-2}</div>`:""}</div></button>`;
  }
  $("calendarGrid").innerHTML=html;
  $("calendarGrid").querySelectorAll("[data-date]").forEach(b=>b.addEventListener("click",()=>{selectedDate=b.dataset.date;const d=new Date(`${selectedDate}T12:00:00`);if(d.getMonth()!==current.getMonth())current=new Date(d.getFullYear(),d.getMonth(),1);render();renderEvents()}));
  renderEvents();
}
function renderEvents(){
  const dayEvents=events.filter(e=>e.date===selectedDate).sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||""));
  $("eventsTitle").textContent=`${dateLabel(selectedDate)} 的事件`;
  $("eventCount").textContent=`${dayEvents.length} 個事件`;
  if(!dayEvents.length){$("eventList").innerHTML='<div class="empty">這天還沒有安排呢 ♡<br>點選「新增事件」，把計畫收進月曆吧！</div>';return}
  $("eventList").innerHTML=dayEvents.map(e=>`<button class="event-card" data-edit="${e.id}"><span class="event-mark ${e.type==="overtime"?"overtime":""}">${e.type==="overtime"?"⏰":"🎀"}</span><span class="event-main"><h3>${escapeHtml(e.name)}</h3><p>${e.type==="overtime"?"加班":"輪班"}${e.notes?" · "+escapeHtml(e.notes):""}</p></span><span class="event-time">${escapeHtml(timeRange(e))}<br>編輯　›</span></button>`).join("");
  $("eventList").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openEvent(b.dataset.edit)));
}
function openEvent(id=null){
  $("eventForm").reset();$("formError").textContent="";
  const e=id?events.find(x=>x.id===id):null;
  $("dialogTitle").textContent=e?"編輯事件":"新增事件";$("eventId").value=e?.id||"";
  $("eventName").value=e?.name||"";$("eventType").value=e?.type||"shift";$("eventDate").value=e?.date||selectedDate;
  $("startTime").value=e?.start_time||"09:00";$("endTime").value=e?.end_time||"18:00";$("eventNotes").value=e?.notes||"";
  $("deleteBtn").classList.toggle("hidden",!e);$("eventDialog").showModal();
}
async function saveEvent(e){
  if(supabaseClient && currentUser){
    const row=toDb(e);const {error}=await supabaseClient.from("events").upsert(row,{onConflict:"id"});
    if(error)throw error;
  }
  const idx=events.findIndex(x=>x.id===e.id);if(idx>=0)events[idx]=e;else events.push(e);
  localSave();render();setStatus(supabaseClient&&currentUser?"雲端已同步":"儲存於本機",!!(supabaseClient&&currentUser));
}
async function deleteEvent(id){
  const old=events.find(e=>e.id===id);if(!old)return;
  if(supabaseClient&&currentUser){const {error}=await supabaseClient.from("events").delete().eq("id",id).eq("user_id",currentUser.id);if(error)throw error}
  events=events.filter(e=>e.id!==id);localSave();render();setStatus(supabaseClient&&currentUser?"雲端已同步":"已從本機刪除",!!(supabaseClient&&currentUser));
}
async function connectSupabase(url,key){
  if(!window.supabase)throw new Error("Supabase SDK 載入失敗，請確認網路連線。");
  supabaseClient=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;
  currentUser=data.session?.user||null;
  if(!currentUser){
    const email=prompt("請輸入你的電子郵件，系統會寄送登入連結：");
    if(!email)throw new Error("已取消登入。");
    const {error:loginError}=await supabaseClient.auth.signInWithOtp({email,options:{emailRedirectTo:location.href}});
    if(loginError)throw loginError;
    setStatus("請查看登入信箱");return;
  }
  await loadCloud();
}
async function loadCloud(){
  const {data,error}=await supabaseClient.from("events").select("*").eq("user_id",currentUser.id).order("event_date");
  if(error)throw error;
  const cloud=(data||[]).map(normalizeRow);
  // Cloud rows win on matching IDs; local-only rows are retained and uploaded.
  const cloudIds=new Set(cloud.map(e=>e.id));
  const localOnly=events.filter(e=>!cloudIds.has(e.id));
  events=[...cloud,...localOnly];localSave();
  for(const e of localOnly){const {error:upErr}=await supabaseClient.from("events").upsert(toDb(e));if(upErr)console.warn("Pending local upload",upErr)}
  setStatus("雲端已連線",true);render();
  supabaseClient.channel("events-live").on("postgres_changes",{event:"*",schema:"public",table:"events",filter:`user_id=eq.${currentUser.id}`},async()=>{try{const {data,error}=await supabaseClient.from("events").select("*").eq("user_id",currentUser.id);if(!error){events=(data||[]).map(normalizeRow);localSave();render()}}catch(e){console.error(e)}}).subscribe();
}
async function init(){
  events=localLoad();render();setStatus("儲存於本機");
  const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null");
  if(s?.url&&s?.key){$("supabaseUrl").value=s.url;$("supabaseKey").value=s.key;try{await connectSupabase(s.url,s.key)}catch(e){setStatus("雲端未連線");console.warn(e)}}
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn);
}
$("addBtn").addEventListener("click",()=>openEvent());
$("prevMonth").addEventListener("click",()=>{current=new Date(current.getFullYear(),current.getMonth()-1,1);render()});
$("nextMonth").addEventListener("click",()=>{current=new Date(current.getFullYear(),current.getMonth()+1,1);render()});
$("todayBtn").addEventListener("click",()=>{const d=new Date();current=new Date(d.getFullYear(),d.getMonth(),1);selectedDate=isoDate(d);render()});
$("closeDialog").addEventListener("click",()=>$("eventDialog").close());
$("cancelBtn").addEventListener("click",()=>$("eventDialog").close());
$("eventForm").addEventListener("submit",async ev=>{
  ev.preventDefault();const id=$("eventId").value||crypto.randomUUID();
  const e={id,name:$("eventName").value.trim(),type:$("eventType").value,date:$("eventDate").value,start_time:$("startTime").value,end_time:$("endTime").value,notes:$("eventNotes").value.trim(),updated_at:new Date().toISOString()};
  if(!e.name||!e.date){$("formError").textContent="請填寫事件名稱與日期。";return}
  if(e.end_time<=e.start_time){$("formError").textContent="結束時間需晚於開始時間；跨日班次請先拆成兩筆事件。";return}
  try{await saveEvent(e);selectedDate=e.date;current=new Date(`${e.date}T12:00:00`);current.setDate(1);$("eventDialog").close();render()}catch(err){$("formError").textContent="儲存失敗："+(err.message||"請稍後再試");}
});
$("deleteBtn").addEventListener("click",async()=>{const id=$("eventId").value;if(!id||!confirm("確定刪除這筆事件嗎？"))return;try{await deleteEvent(id);$("eventDialog").close()}catch(e){$("formError").textContent="刪除失敗："+e.message}});
$("settingsBtn").addEventListener("click",()=>$("settingsDialog").showModal());
$("closeSettings").addEventListener("click",()=>$("settingsDialog").close());
$("cancelSettings").addEventListener("click",()=>$("settingsDialog").close());
$("disconnectBtn").addEventListener("click",()=>{localStorage.removeItem(SETTINGS_KEY);supabaseClient=null;currentUser=null;$("supabaseUrl").value="";$("supabaseKey").value="";setStatus("儲存於本機");$("settingsMessage").textContent="已清除連線設定；本機事件保留。"});
$("settingsForm").addEventListener("submit",async ev=>{ev.preventDefault();const url=$("supabaseUrl").value.trim(),key=$("supabaseKey").value.trim();try{if(!url||!key)throw new Error("請填寫 Project URL 與 anon/publishable key。");localStorage.setItem(SETTINGS_KEY,JSON.stringify({url,key}));await connectSupabase(url,key);$("settingsMessage").textContent="設定已儲存。若是首次登入，請先完成信箱登入連結。"}catch(e){$("settingsMessage").textContent=e.message||"連線失敗";setStatus("雲端未連線")}});
init();
