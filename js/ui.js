/* ================= 弹窗 / Toast ================= */
function showModal(title, bodyHtml, btns){
  const ov = document.getElementById('modalOverlay');
  ov.innerHTML = '<div class="modal"><h3>'+esc(title)+'</h3>'+bodyHtml
    + '<div class="btns">'+btns.map(b=>'<button class="'+b[0]+'" onclick="'+b[2]+'">'+b[1]+'</button>').join('')+'</div></div>';
  ov.classList.remove('hidden');
}

function closeModal(){
  const ov = document.getElementById('modalOverlay');
  ov.classList.add('hidden');
  ov.innerHTML = '';
}

let toastTimer = null;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.add('hidden'), 2500);
}
