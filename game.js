const socket=io();let myId=null,room=null,privateData=null,state=null;
const $=id=>document.getElementById(id);
function showError(s){$("error").textContent=s||""}
function enter(result){myId=result.playerId;room=result.code;privateData=result.privateData;state=result.state;$("lobby").hidden=true;$("game").hidden=false;$("roomcode").textContent=room;render();}
$("create").onclick=()=>socket.emit("createRoom",{name:$("name").value},r=>r.error?showError(r.error):enter(r));
$("join").onclick=()=>socket.emit("joinRoom",{name:$("name").value,code:$("code").value},r=>r.error?showError(r.error):enter(r));
$("start").onclick=()=>socket.emit("startGame");
$("copy").onclick=async()=>{const url=location.origin+"?room="+room;try{await navigator.clipboard.writeText(url);$("copy").textContent="Invite copied!";}catch{$("copy").textContent=url;}};
document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>socket.emit("action",{action:b.dataset.action},r=>{if(r?.error)$("notice").textContent=r.error;else $("notice").textContent="";}));
socket.on("state",s=>{state=s;render();});
socket.on("privateUpdate",x=>{if(x.playerId===myId){privateData=x.data;render();}});
socket.on("notice",s=>$("notice").textContent=s);
function render(){if(!state)return;$("sanitytext").textContent=state.sanity+"%";$("sanitybar").style.width=state.sanity+"%";$("round").textContent=state.round;$("facility").textContent=state.explored.length?state.explored.join(" · "):"Unexplored. Search for supplies and explore carefully."; $("players").innerHTML=state.players.map(p=>`<div class="player"><strong>${escapeHtml(p.name)} ${p.alive?"":"☠"}</strong><span>${p.health} HP · ${escapeHtml(p.location)} ${p.connected?"":"(offline)"}</span></div>`).join("");$("log").innerHTML=state.log.slice().reverse().map(x=>`<div>${escapeHtml(x)}</div>`).join("");$("start").disabled=state.started;$("start").textContent=state.started?"Survival in progress":"Start survival (2+ players)";if(privateData){$("inventory").innerHTML=privateData.inventory.map(item=>`<button class="item" data-item="${escapeHtml(item)}">${escapeHtml(item)} · use</button>`).join("")||'<span class="muted">Empty — search for supplies.</span>';document.querySelectorAll("[data-item]").forEach(b=>b.onclick=()=>socket.emit("action",{action:"use",target:b.dataset.item},r=>{if(r?.error)$("notice").textContent=r.error;}));}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
const code=new URLSearchParams(location.search).get("room");if(code){$("code").value=code;$("name").focus();}
