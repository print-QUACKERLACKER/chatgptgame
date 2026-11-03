import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomUUID } from "crypto";

const app=express();
const http=createServer(app);
const io=new Server(http);
app.use(express.static("public"));

const rooms=new Map();
const ITEMS=["Bandage","Battery","Scrap","Ration","Herb","Fuse"];
const roomCode=()=>Math.random().toString(36).slice(2,6).toUpperCase();

function makeRoom(code){
 return {code,started:false,round:1,night:1,sanity:100,power:0,signal:0,log:["The facility is silent. Find a way out before dawn."],
 players:{}, rooms:["Entrance","Dormitory","Laboratory","Generator Room","Archive","Loading Bay"], explored:[], escapeReady:false};
}
function publicState(r){
 return {code:r.code,started:r.started,round:r.round,night:r.night,sanity:r.sanity,power:r.power,signal:r.signal,log:r.log.slice(-12),
 players:Object.values(r.players).map(p=>({id:p.id,name:p.name,health:p.health,location:p.location,alive:p.alive,connected:p.connected})),
 explored:r.explored,escapeReady:r.escapeReady};
}
function emitRoom(r){io.to(r.code).emit("state",publicState(r));}
function addLog(r,msg){r.log.push(msg);if(r.log.length>40)r.log.shift();}
function privateState(p){return {inventory:p.inventory,health:p.health,location:p.location,alive:p.alive};}

io.on("connection",socket=>{
 socket.on("createRoom",({name},cb)=>{
  let code=roomCode();while(rooms.has(code))code=roomCode();
  const r=makeRoom(code);rooms.set(code,r);joinPlayer(socket,r,name,cb);
 });
 socket.on("joinRoom",({code,name},cb)=>{
  const r=rooms.get(String(code||"").toUpperCase());
  if(!r)return cb?.({error:"Room not found. Check the code and try again."});
  if(r.started && Object.keys(r.players).length>=4)return cb?.({error:"This room is full."});
  joinPlayer(socket,r,name,cb);
 });
 socket.on("startGame",()=>{
  const r=rooms.get(socket.data.room);if(!r||r.started)return;
  if(Object.keys(r.players).length<2){socket.emit("notice","You need at least 2 players to start.");return;}
  r.started=true;addLog(r,"The doors lock behind you. Survive until dawn.");emitRoom(r);
 });
 socket.on("action",({action,target},cb)=>{
  const r=rooms.get(socket.data.room),p=r?.players[socket.id];
  if(!r||!p||!r.started||!p.alive)return cb?.({error:"You cannot act right now."});
  const alive=Object.values(r.players).filter(x=>x.alive);
  if(action==="search"){
   const item=ITEMS[Math.floor(Math.random()*ITEMS.length)];
   if(p.inventory.length<4){p.inventory.push(item);addLog(r,`${p.name} searched ${p.location} and found supplies.`);}
   else addLog(r,`${p.name} searched ${p.location}, but their inventory is full.`);
   r.sanity=Math.max(0,r.sanity-4);
  } else if(action==="explore"){
   const places=r.rooms.filter(x=>!r.explored.includes(x));
   if(places.length){const place=places[Math.floor(Math.random()*places.length)];r.explored.push(place);p.location=place;addLog(r,`${p.name} discovered ${place}.`);}
   else {p.location=r.rooms[Math.floor(Math.random()*r.rooms.length)];addLog(r,`${p.name} moved to ${p.location}.`);}
   r.sanity=Math.max(0,r.sanity-6);
   if(Math.random()<.35){p.health=Math.max(0,p.health-15);addLog(r,`Something attacked ${p.name} in the dark!`);if(p.health===0){p.alive=false;addLog(r,`${p.name} has fallen.`);}}
  } else if(action==="rest"){
   p.health=Math.min(100,p.health+15);r.sanity=Math.min(100,r.sanity+3);addLog(r,`${p.name} rests and regains composure.`);
  } else if(action==="repair"){
   const i=p.inventory.indexOf("Scrap");if(i<0)return cb?.({error:"You need Scrap to repair the generator."});
   p.inventory.splice(i,1);r.power=Math.min(3,r.power+1);addLog(r,`${p.name} repaired the generator (${r.power}/3).`);
  } else if(action==="use"){
   if(!target)return cb?.({error:"Choose an item to use."});
   const i=p.inventory.indexOf(target);if(i<0)return cb?.({error:"That item isn't in your inventory."});
   if(target==="Bandage"){p.health=Math.min(100,p.health+35);p.inventory.splice(i,1);addLog(r,`${p.name} used a Bandage.`);}
   else if(target==="Ration"){r.sanity=Math.min(100,r.sanity+8);p.inventory.splice(i,1);addLog(r,`${p.name} ate a Ration. The group steadies.`);}
   else if(target==="Battery"){r.sanity=Math.min(100,r.sanity+5);p.inventory.splice(i,1);addLog(r,`${p.name} used a Battery to restore light.`);}
   else if(target==="Fuse"){r.signal=Math.min(3,r.signal+1);p.inventory.splice(i,1);addLog(r,`${p.name} installed a Fuse (${r.signal}/3).`);}
   else if(target==="Herb"){p.health=Math.min(100,p.health+15);r.sanity=Math.min(100,r.sanity+5);p.inventory.splice(i,1);addLog(r,`${p.name} used an Herb.`);}
   else return cb?.({error:"Scrap is used for repairs."});
  } else if(action==="signal"){
   if(r.power<3)return cb?.({error:"Restore generator power to 3 first."});
   if(r.signal<3)return cb?.({error:"Install 3 Fuses to activate the rescue signal."});
   r.escapeReady=true;addLog(r,"THE RESCUE SIGNAL IS LIVE. Survive one more round!");
  } else if(action==="endRound"){
   r.round++;if(r.round%3===0){r.night++;r.sanity=Math.max(0,r.sanity-10);for(const q of alive){if(Math.random()<.25){q.health=Math.max(0,q.health-10);if(!q.health)q.alive=false;}}addLog(r,`Night ${r.night}: the darkness grows stronger.`);}
   if(r.escapeReady){r.won=true;addLog(r,"DAWN BREAKS. The survivors are rescued!");}
  } else return cb?.({error:"Unknown action."});
  if(r.sanity<=0){r.lost=true;addLog(r,"SANITY COLLAPSED. The facility claims everyone.");}
  if(Object.values(r.players).every(x=>!x.alive)){r.lost=true;addLog(r,"No survivors remain.");}
  emitRoom(r);io.to(r.code).emit("privateUpdate",{playerId:socket.id,data:privateState(p)});
  cb?.({ok:true});
 });
 socket.on("disconnect",()=>{
  const r=rooms.get(socket.data.room),p=r?.players[socket.id];
  if(p){p.connected=false;addLog(r,`${p.name} disconnected.`);emitRoom(r);}
 });
});
function joinPlayer(socket,r,name,cb){
 name=String(name||"").trim().slice(0,18)||"Survivor";
 if(Object.values(r.players).some(p=>p.name.toLowerCase()===name.toLowerCase()))name=name+"-"+Math.floor(Math.random()*99);
 const p={id:socket.id,name,health:100,location:"Entrance",alive:true,connected:true,inventory:["Battery","Ration"]};
 r.players[socket.id]=p;socket.data.room=r.code;socket.join(r.code);
 cb?.({ok:true,code:r.code,playerId:socket.id,privateData:privateState(p),state:publicState(r)});
 addLog(r,`${name} joined the facility.`);emitRoom(r);
}
const PORT=process.env.PORT||3000;
http.listen(PORT,()=>console.log(`The Last Light listening on ${PORT}`));
