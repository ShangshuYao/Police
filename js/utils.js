/* ================= 通用工具 ================= */
function genId(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function fmt(n){ return Number(n).toFixed(2); }

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function nowStr(){
  const d = new Date();
  const p = x => String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}

function val(id){ return document.getElementById(id).value; }

function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes){
  let s='';
  const CH = 0x8000;
  for(let i=0;i<bytes.length;i+=CH) s += String.fromCharCode.apply(null, bytes.subarray(i,i+CH));
  return btoa(s);
}

function csvCell(v){
  v = String(v);
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
}

function safeFileName(s){ return String(s).replace(/[\\\/:*?"<>|]/g, '_'); }
