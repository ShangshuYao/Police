/* ================= 会话 / 导航 / 启动 ================= */
const SKEY = 'pm_cur_user';
let currentUser = null;
let view = 'shop';
let cart = [];                     // {itemId, qty}

function loadCart(){
  try{ cart = JSON.parse(localStorage.getItem('pm_cart_'+currentUser.username)) || []; }catch(e){ cart = []; }
  cart = cart.filter(c => itemById(c.itemId));
}
function saveCart(){ localStorage.setItem('pm_cart_'+currentUser.username, JSON.stringify(cart)); }

async function doLogin(){
  const u = val('loginUser').trim();
  const p = val('loginPwd');
  if(!u || !p){ toast('请输入用户名和密码'); return; }
  let res;
  try{
    res = await apiLogin(u, p);
  }catch(e){ toast(e.message || '登录失败'); return; }
  if(!res || !res.user){ toast('用户名或密码错误'); return; }
  currentUser = res.user;
  try{
    await refreshCache();
  }catch(e){ toast(e.message || '加载数据失败'); return; }
  loadCart();
  view = currentUser.role==='admin' ? 'dashboard' : 'shop';
  enterApp();
}

function logout(){
  if(!confirm('确定退出登录吗？')) return;
  apiLogout();
  currentUser = null;
  cache.users = []; cache.requests = []; cache.items = []; cache.categories = [];
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('loginPwd').value = '';
}

function enterApp(){
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('whoami').textContent = currentUser.username;
  const tag = document.getElementById('roleTag');
  tag.textContent = currentUser.role==='admin' ? '管理员' : '普通用户';
  tag.className = 'role-tag' + (currentUser.role==='admin' ? ' admin' : '');
  document.getElementById('cartEntry').classList.toggle('hidden', currentUser.role!=='user');
  render();
}

function switchView(v){
  view = v;
  render();
  // 后台刷新缓存后再渲染一次，保证看到最新数据
  refreshCache().then(()=>render()).catch(()=>{});
}

function render(){
  renderSidebar(); updateCartCount();
  const main = document.getElementById('main');
  if(view==='shop')           main.innerHTML = viewShop();
  else if(view==='myreq')     main.innerHTML = viewMyRequests();
  else if(view==='dashboard') main.innerHTML = viewDashboard();
  else if(view==='items')     main.innerHTML = viewItems();
  else if(view==='review')    main.innerHTML = viewReview();
  else if(view==='export')    main.innerHTML = viewExport();
  else if(view==='users')     main.innerHTML = viewUsers();
}

function renderSidebar(){
  const nav = [];
  if(currentUser.role==='user'){
    nav.push(['shop','🛍️','采购大厅']);
    nav.push(['myreq','📋','我的申请']);
  } else {
    nav.push(['dashboard','📊','数据概览']);
    nav.push(['items','🗂️','物品管理']);
    nav.push(['review','✅','审核中心']);
    nav.push(['export','📤','采购明细']);
    nav.push(['users','👥','用户管理']);
  }
  document.getElementById('sidebar').innerHTML = nav.map(n=>
    '<div class="nav-item'+(view===n[0]?' active':'')+'" onclick="switchView(\''+n[0]+'\')">'+n[1]+' '+n[2]+'</div>').join('');
}

function updateCartCount(){
  document.getElementById('cartCount').textContent = cart.reduce((s,c)=>s+c.qty,0);
}

/* ================= 修改密码（本人，两种角色通用） ================= */
function openPwdModal(){
  showModal('修改密码 · ' + currentUser.username,
    '<div class="form-row"><label>旧密码</label>'
    + '<input id="oldPwd" type="password" placeholder="请输入当前密码"></div>'
    + '<div class="form-row"><label>新密码</label>'
    + '<input id="newPwd" type="password" placeholder="至少 6 位"></div>'
    + '<div class="form-row"><label>确认新密码</label>'
    + '<input id="newPwd2" type="password" placeholder="再次输入新密码" onkeydown="if(event.key===\'Enter\')doChangePassword()"></div>'
    + '<div class="muted" style="font-size:13px">密码保存在服务器数据库中（SHA-256 加盐加密）。修改成功后需用新密码重新登录。</div>',
    [['btn-primary','确认修改','doChangePassword()'],['btn-gray','取消','closeModal()']]);
}

async function doChangePassword(){
  const oldP = val('oldPwd');
  const newP = val('newPwd');
  const newP2 = val('newPwd2');
  if(!oldP || !newP){ toast('请填写旧密码和新密码'); return; }
  if(newP.length < 6){ toast('新密码长度至少 6 位'); return; }
  if(newP !== newP2){ toast('两次输入的新密码不一致'); return; }
  try{
    await apiChangePassword(oldP, newP);
  }catch(e){ toast(e.message || '修改失败'); return; }
  closeModal();
  toast('密码修改成功，请重新登录');
  setTimeout(()=>{ apiLogout(); location.reload(); }, 1200);
}

/* ================= 启动 ================= */
(async function boot(){
  const bootEl = document.getElementById('boot');
  const bootText = document.getElementById('bootText');
  try{
    await initDb();
    const me = await apiMe();
    bootEl.remove();
    if(me && me.user){
      currentUser = me.user;
      await refreshCache();
      loadCart();
      view = currentUser.role==='admin' ? 'dashboard' : 'shop';
      enterApp();
    }else{
      document.getElementById('loginPage').classList.remove('hidden');
    }
  }catch(e){
    bootText.innerHTML = '<span style="color:#dc2626">'+(e.message||'无法连接服务器，请确认服务端已启动后刷新页面重试。')+'</span>';
    bootEl.querySelector('.spin').style.display = 'none';
  }
})();
