/**
 * Standalone LIFF HTML pages — served inline, no external JS dependencies.
 * These pages do NOT run the friend-add flow.
 */

export function generateBookingHtml(liffId: string, apiUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>予約</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans','Yu Gothic',system-ui,sans-serif;background:#f5f5f5;color:#333}
#app{max-width:480px;margin:0 auto;padding:16px}
.header{text-align:center;margin:12px 0 20px}
.header h1{font-size:20px;color:#333}
.header p{font-size:13px;color:#999;margin-top:4px}
.card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px}
.cal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cal-title{font-size:16px;font-weight:700}
.cal-nav{width:36px;height:36px;border:none;background:#f0f0f0;border-radius:50%;font-size:16px;cursor:pointer}
.cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;margin-bottom:4px}
.cal-weekdays span{font-size:11px;font-weight:600;color:#999;padding:4px 0}
.cal-weekdays .sun{color:#e53e3e}.cal-weekdays .sat{color:#3b82f6}
.cal-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.day{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:50%;font-size:14px;cursor:pointer;border:none;background:none;font-family:inherit}
.day.past{color:#ccc;cursor:default}.day.today{font-weight:700}
.day.selected{background:#06C755;color:#fff;font-weight:700}
.day.closed{color:#ddd;cursor:default;text-decoration:line-through}
.slots-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.slot{padding:10px 4px;border:1.5px solid #06C755;border-radius:8px;background:#e8faf0;color:#06C755;font-size:14px;font-weight:600;cursor:pointer;text-align:center;font-family:inherit}
.slot.full{border-color:#ddd;background:#f5f5f5;color:#bbb;cursor:default}
.slot.sel{background:#06C755;color:#fff}
.form-field{margin-bottom:12px}
.form-field label{display:block;font-size:13px;font-weight:600;color:#555;margin-bottom:4px}
.form-field input{width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;font-family:inherit}
.form-field input:focus{outline:none;border-color:#06C755}
.btn{width:100%;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:8px}
.btn-primary{background:#06C755;color:#fff}
.btn-secondary{background:#fff;border:1.5px solid #06C755;color:#06C755}
.btn:disabled{background:#bbb;cursor:default}
.confirm-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
.confirm-row:last-child{border:none}
.label{color:#999}.val{font-weight:600}
.success-icon{width:64px;height:64px;border-radius:50%;background:#06C755;color:#fff;font-size:32px;line-height:64px;margin:0 auto 16px;text-align:center}
.loading{text-align:center;padding:40px 0}
.spinner{width:32px;height:32px;border:3px solid #e0e0e0;border-top-color:#06C755;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
.err{color:#e53e3e;text-align:center;padding:20px}
.info{font-size:12px;color:#999;text-align:center;margin-top:8px}
.svc-list{display:flex;flex-direction:column;gap:10px}
.svc-card{background:#fff;border:1.5px solid #e0e0e0;border-radius:12px;padding:16px;cursor:pointer;transition:border-color .2s}
.svc-card:hover{border-color:#06C755}
.svc-card.sel{border-color:#06C755;background:#e8faf0}
.svc-name{font-size:15px;font-weight:700;color:#333}
.svc-desc{font-size:12px;color:#999;margin-top:2px}
.svc-meta{font-size:12px;color:#06C755;margin-top:6px;font-weight:600}
</style>
</head>
<body>
<div id="app"><div class="loading"><div class="spinner"></div><p>読み込み中...</p></div></div>
<script>
(function(){
const LIFF_ID="${liffId}";
const API="${apiUrl}";
const WEEKDAYS=["日","月","火","水","木","金","土"];
let profile=null,friendId=null,settings=null,allServices=[];
let selService=null;
let year=new Date().getFullYear(),month=new Date().getMonth();
let selDate=null,slots=[],selSlot=null,formData={},step="service";

// Check URL param for pre-selected service
const urlParams=new URLSearchParams(window.location.search);
const preServiceId=urlParams.get("serviceId");

function $(s){return document.querySelector(s)}
function app(){return $("#app")}
function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
function api(path,opts){return fetch(API+path,{...opts,headers:{"Content-Type":"application/json",...(opts||{}).headers}})}
function pad(n){return String(n).padStart(2,"0")}
function dateStr(y,m,d){return y+"-"+pad(m+1)+"-"+pad(d)}
function fmtDate(s){const d=new Date(s+"T00:00:00");return d.getFullYear()+"年"+(d.getMonth()+1)+"月"+d.getDate()+"日("+WEEKDAYS[d.getDay()]+")"}
function fmtTime(iso){try{const d=new Date(iso);return pad(d.getHours())+":"+pad(d.getMinutes())}catch{return iso}}
function isToday(y,m,d){const n=new Date();return n.getFullYear()===y&&n.getMonth()===m&&n.getDate()===d}
function isPast(y,m,d){const n=new Date();n.setHours(0,0,0,0);return new Date(y,m,d)<n}

function curSettings(){
  if(selService)return selService;
  return settings;
}

function closedDays(){var s=curSettings();if(!s)return[];try{return Array.isArray(s.closedDays)?s.closedDays:JSON.parse(s.closedDays||"[]")}catch{return[]}}
function closedDates(){var s=curSettings();if(!s)return[];try{return Array.isArray(s.closedDates)?s.closedDates:JSON.parse(s.closedDates||"[]")}catch{return[]}}
function isClosed(y,m,d){
  const dow=["sun","mon","tue","wed","thu","fri","sat"][new Date(y,m,d).getDay()];
  if(closedDays().includes(dow))return true;
  if(closedDates().includes(dateStr(y,m,d)))return true;
  var s=curSettings();
  const maxDays=s?.maxAdvanceDays||30;
  const maxDate=new Date();maxDate.setDate(maxDate.getDate()+maxDays);
  if(new Date(y,m,d)>maxDate)return true;
  return false;
}

function renderServiceSelection(){
  if(!allServices.length)return'<div class="card"><p class="info">予約可能なサービスがありません</p></div>';
  return'<div class="card"><p style="font-size:15px;font-weight:700;margin-bottom:12px">メニューを選択</p><div class="svc-list">'+allServices.map(function(s){
    return'<div class="svc-card" data-svc="'+s.id+'"><div class="svc-name">'+esc(s.name)+'</div>'+(s.description?'<div class="svc-desc">'+esc(s.description)+'</div>':'')+'<div class="svc-meta">'+s.duration+'分</div></div>';
  }).join("")+'</div></div>';
}

function renderCal(){
  const dim=new Date(year,month+1,0).getDate();
  const first=new Date(year,month,1).getDay();
  let days="";
  for(let i=0;i<first;i++)days+='<span></span>';
  for(let d=1;d<=dim;d++){
    const ds=dateStr(year,month,d);
    const past=isPast(year,month,d);
    const today=isToday(year,month,d);
    const closed=!past&&isClosed(year,month,d);
    const sel=selDate===ds;
    let cls="day";
    if(past)cls+=" past";
    if(today)cls+=" today";
    if(closed)cls+=" closed";
    if(sel)cls+=" selected";
    const disabled=past||closed;
    days+='<button class="'+cls+'" '+(disabled?"disabled":'data-d="'+ds+'"')+'>'+d+'</button>';
  }
  var svcLabel=selService?'<p style="font-size:13px;color:#06C755;font-weight:600;margin-bottom:8px">'+esc(selService.name)+' ('+selService.duration+'分)</p>':"";
  return '<div class="card">'+svcLabel+'<div class="cal-header"><button class="cal-nav" data-a="prev">&lt;</button><span class="cal-title">'+year+"年"+(month+1)+'月</span><button class="cal-nav" data-a="next">&gt;</button></div><div class="cal-weekdays">'+WEEKDAYS.map((w,i)=>'<span class="'+(i===0?"sun":i===6?"sat":"")+'">'+w+"</span>").join("")+'</div><div class="cal-days">'+days+"</div></div>";
}

function renderSlots(){
  if(!selDate)return"";
  if(!slots.length)return'<div class="card"><p class="info">この日の空き枠はありません</p></div>';
  return'<div class="card"><p style="font-size:14px;font-weight:700;margin-bottom:12px">'+fmtDate(selDate)+'</p><div class="slots-grid">'+slots.map(s=>{
    const sel=selSlot&&selSlot.startAt===s.startAt;
    return'<button class="slot'+(s.available?(sel?" sel":""):" full")+'" '+(s.available?'data-s=\\''+JSON.stringify(s)+"\\'":"")+'>'+fmtTime(s.startAt)+"</button>"
  }).join("")+"</div></div>";
}

function renderForm(){
  var cs=curSettings();
  const fields=(cs?.bookingFields||[]).map(f=>'<div class="form-field"><label>'+esc(f.label)+(f.required?' <span style="color:#e53e3e">*</span>':"")+'</label><input data-f="'+f.name+'" value="'+esc(formData[f.name]||"")+'" placeholder="'+esc(f.label)+'"></div>').join("");
  return'<div class="card"><p style="font-size:15px;font-weight:700;margin-bottom:4px">お客様情報</p><p class="info" style="margin-bottom:16px">'+(selService?esc(selService.name)+" / ":"")+fmtDate(selDate)+" "+fmtTime(selSlot.startAt)+" - "+fmtTime(selSlot.endAt)+'</p>'+fields+'<button class="btn btn-primary" id="toConfirm">確認画面へ</button><button class="btn btn-secondary" id="backCal" style="margin-top:8px">戻る</button></div>';
}

function renderConfirm(){
  var rows=[];
  if(selService)rows.push({l:"メニュー",v:selService.name});
  rows.push({l:"日付",v:fmtDate(selDate)},{l:"時間",v:fmtTime(selSlot.startAt)+" - "+fmtTime(selSlot.endAt)});
  var cs=curSettings();
  (cs?.bookingFields||[]).forEach(f=>{if(formData[f.name])rows.push({l:f.label,v:formData[f.name]})});
  return'<div class="card"><p style="font-size:15px;font-weight:700;text-align:center;margin-bottom:16px">予約内容の確認</p>'+rows.map(r=>'<div class="confirm-row"><span class="label">'+esc(r.l)+'</span><span class="val">'+esc(r.v)+"</span></div>").join("")+'<button class="btn btn-primary" id="submitBtn">予約を確定する</button><button class="btn btn-secondary" id="backForm" style="margin-top:8px">戻る</button></div>';
}

function render(){
  let html='<div class="header"><h1>予約</h1><p>ご希望の日時をお選びください</p></div>';
  if(step==="service"){
    html+=renderServiceSelection();
  }else if(step==="calendar"){
    if(allServices.length>1)html+='<p style="text-align:center;margin-bottom:8px"><a href="#" id="backToSvc" style="font-size:13px;color:#06C755">&larr; メニュー選択に戻る</a></p>';
    html+=renderCal()+renderSlots();
  }else if(step==="form"){
    html=renderForm();
  }else if(step==="confirm"){
    html=renderConfirm();
  }
  app().innerHTML=html;
  bind();
}

function renderSuccess(){
  var svcRow=selService?'<div class="confirm-row"><span class="label">メニュー</span><span class="val">'+esc(selService.name)+'</span></div>':"";
  app().innerHTML='<div class="card" style="text-align:center;padding:32px 24px"><div class="success-icon">✓</div><h2 style="color:#06C755;margin-bottom:16px">予約が完了しました</h2>'+svcRow+'<div class="confirm-row"><span class="label">日付</span><span class="val">'+fmtDate(selDate)+'</span></div><div class="confirm-row"><span class="label">時間</span><span class="val">'+fmtTime(selSlot.startAt)+" - "+fmtTime(selSlot.endAt)+'</span></div><p style="font-size:14px;color:#666;margin-top:16px;line-height:1.6">ご予約ありがとうございます。<br>当日のお越しをお待ちしております。</p><button class="btn btn-secondary" id="closeBtn" style="margin-top:20px">閉じる</button></div>';
  const cb=document.getElementById("closeBtn");
  if(cb)cb.onclick=function(){try{liff.closeWindow()}catch{window.close()}};
}

function renderErr(msg){
  app().innerHTML='<div class="card" style="text-align:center"><h2 style="color:#e53e3e">エラー</h2><p class="err">'+esc(msg)+'</p><button class="btn btn-secondary" id="retryBtn" style="margin-top:16px">やり直す</button></div>';
  const rb=document.getElementById("retryBtn");
  if(rb)rb.onclick=function(){selDate=null;selSlot=null;slots=[];step=allServices.length>1?"service":"calendar";render()};
}

function bind(){
  // Service selection
  document.querySelectorAll(".svc-card[data-svc]").forEach(function(b){
    b.addEventListener("click",function(){
      var sid=b.dataset.svc;
      selService=allServices.find(function(s){return s.id===sid})||null;
      selDate=null;selSlot=null;slots=[];formData={};
      step="calendar";render();
    });
  });
  // Back to service selection
  var bts=document.getElementById("backToSvc");
  if(bts)bts.onclick=function(e){e.preventDefault();selService=null;selDate=null;selSlot=null;slots=[];step="service";render()};
  // Calendar nav
  document.querySelectorAll(".cal-nav").forEach(function(b){
    b.addEventListener("click",function(){
      if(b.dataset.a==="prev"){month--;if(month<0){month=11;year--}}else{month++;if(month>11){month=0;year++}}
      selDate=null;selSlot=null;slots=[];render();
    });
  });
  // Date selection
  document.querySelectorAll(".day[data-d]").forEach(function(b){
    b.addEventListener("click",function(){
      selDate=b.dataset.d;selSlot=null;slots=[];
      render();loadSlots(selDate);
    });
  });
  // Slot selection
  document.querySelectorAll(".slot:not(.full)").forEach(function(b){
    b.addEventListener("click",function(){
      try{selSlot=JSON.parse(b.dataset.s)}catch{}
      if(profile&&!formData.name)formData.name=profile.displayName;
      var cs=curSettings();
      var fields=cs?.bookingFields||[];
      step=fields.length>0?"form":"confirm";
      render();
    });
  });
  // Form inputs
  document.querySelectorAll("[data-f]").forEach(function(inp){
    inp.addEventListener("input",function(){formData[inp.dataset.f]=inp.value});
  });
  // Form buttons
  var tc=document.getElementById("toConfirm");
  if(tc)tc.onclick=function(){
    var cs=curSettings();
    var fields=cs?.bookingFields||[];
    for(var i=0;i<fields.length;i++){if(fields[i].required&&!(formData[fields[i].name]||"").trim()){alert(fields[i].label+"を入力してください");return}}
    step="confirm";render();
  };
  var bc=document.getElementById("backCal");
  if(bc)bc.onclick=function(){step="calendar";render()};
  var bf=document.getElementById("backForm");
  if(bf)bf.onclick=function(){var cs=curSettings();step=(cs?.bookingFields||[]).length>0?"form":"calendar";render()};
  var sb=document.getElementById("submitBtn");
  if(sb)sb.onclick=submitBooking;
}

async function loadSlots(date){
  app().querySelector(".card:last-child")?.insertAdjacentHTML("beforeend",'<div class="loading"><div class="spinner"></div></div>');
  try{
    var svcParam=selService?"&serviceId="+selService.id:"";
    var res=await api("/api/calendar/available?date="+date+svcParam);
    var json=await res.json();
    if(json.success){
      var d=json.data;
      slots=Array.isArray(d)?d:Array.isArray(d.slots)?d.slots:[];
    }else{slots=[]}
  }catch{slots=[]}
  render();
}

async function loadSettings(){
  try{
    var res=await api("/api/calendar/settings-public");
    var json=await res.json();
    if(json.success&&json.data){
      settings=json.data;
      if(json.data.services&&json.data.services.length>0){
        allServices=json.data.services;
        // If pre-selected via URL param or only 1 service, skip selection
        if(preServiceId){
          var pre=allServices.find(function(s){return s.id===preServiceId});
          if(pre){selService=pre;step="calendar";return}
        }
        if(allServices.length===1){
          selService=allServices[0];step="calendar";
        }else{
          step="service";
        }
      }else{
        // Legacy mode: no services, go directly to calendar
        step="calendar";
      }
    }
  }catch{}
}

async function submitBooking(){
  var sb=document.getElementById("submitBtn");
  if(sb){sb.disabled=true;sb.textContent="送信中..."}
  try{
    var body={date:selDate,startTime:selSlot.startAt,endTime:selSlot.endAt,bookingData:formData};
    if(selService)body.serviceId=selService.id;
    if(friendId)body.friendId=friendId;
    if(profile)body.bookingData={...formData,lineDisplayName:profile.displayName};
    var res=await api("/api/calendar/book",{method:"POST",body:JSON.stringify(body)});
    var json=await res.json();
    if(json.success){renderSuccess()}else{renderErr(json.error||"予約に失敗しました")}
  }catch(e){renderErr(e.message||"予約に失敗しました")}
}

async function init(){
  try{
    await liff.init({liffId:LIFF_ID});
    if(!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return}
    profile=await liff.getProfile();
    // Silent UUID linking
    try{friendId=localStorage.getItem("lh_uuid")}catch{}
    var tok=liff.getIDToken();
    if(tok){
      api("/api/liff/link",{method:"POST",body:JSON.stringify({idToken:tok,displayName:profile.displayName,existingUuid:friendId})})
      .then(async function(r){if(r.ok){var d=await r.json();if(d?.data?.userId){try{localStorage.setItem("lh_uuid",d.data.userId);friendId=d.data.userId}catch{}}}})
      .catch(function(){});
    }
    await loadSettings();
    render();
  }catch(e){
    renderErr("初期化エラー: "+(e.message||e));
  }
}
init();
})();
</script>
</body>
</html>`;
}

export function generateFormHtml(liffId: string, apiUrl: string, formId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>フォーム</title>
<script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans','Yu Gothic',system-ui,sans-serif;background:#f5f5f5;color:#333}
#app{max-width:480px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px}
.loading{text-align:center;padding:40px 0}
.spinner{width:32px;height:32px;border:3px solid #e0e0e0;border-top-color:#06C755;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="app"><div class="loading"><div class="spinner"></div><p>読み込み中...</p></div></div>
<script>
(function(){
const LIFF_ID="${liffId}";
const API="${apiUrl}";
const FORM_ID="${formId}";
async function init(){
  try{
    await liff.init({liffId:LIFF_ID});
    if(!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return}
    // Redirect to the main LIFF with form page params
    window.location.href=API+"/liff?page=form&id="+FORM_ID;
  }catch(e){
    document.getElementById("app").innerHTML='<div class="card"><h2 style="color:#e53e3e">エラー</h2><p>'+e.message+'</p></div>';
  }
}
init();
})();
</script>
</body>
</html>`;
}
