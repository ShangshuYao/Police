/* ================= 服务端 API 数据层 =================
 * 数据集中存储在服务器 SQLite（app.py），多设备实时共享。
 * 本文件负责：
 *   - 异步调用服务端 API（apiXxx 函数，用于增删改、登录）
 *   - 维护客户端内存缓存（cache），提供同名同步读取函数
 *     （allItems / itemById / loadRequests / userLimit 等，
 *      供各页面渲染时同步使用）
 * 页面在每次登录、切换、修改后调用 refreshCache() 刷新缓存。
 */

/* ---- 客户端缓存（由 refreshCache 填充） ---- */
let cache = {
  categories: [],   // [{id, name}]
  items: [],        // [{id, name, cat_id, price, unit, cat_name}]
  requests: [],     // [{id, no, username, date, status, note, comment, review_time, items:[...]}]
  users: []         // 管理员：[{username, role, limit_amt, used, pending}]
};
let myLimit = { limit_amt: 0, used: 0, pending: 0 };  // 当前普通用户的限额信息

/* ---- 基础请求封装 ---- */
async function api(path, options){
  options = options || {};
  const opts = { method: options.method || 'GET', headers: {}, credentials: 'same-origin' };
  if(options.body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  let res;
  try{
    res = await fetch(path, opts);
  }catch(e){
    throw { message: '无法连接服务器，请检查网络或稍后重试' };
  }
  let data = null;
  try{ data = await res.json(); }catch(e){ /* 非 JSON 响应 */ }
  if(!res.ok){
    throw { message: (data && data.error) ? data.error : ('请求失败（HTTP ' + res.status + '）') };
  }
  return data;
}

/* ---- 启动初始化：探测服务器是否可达 ---- */
async function initDb(){
  await api('/api/me');
}

/* ---- 刷新缓存（登录后 / 数据变更后 / 切换页面时调用） ---- */
async function refreshCache(){
  const role = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : null;
  const [cats, items, reqs] = await Promise.all([
    api('/api/categories'),
    api('/api/items'),
    api('/api/requests')
  ]);
  cache.categories = cats || [];
  cache.items = items || [];
  cache.requests = reqs || [];
  if(role === 'admin'){
    const data = await api('/api/users');
    cache.users = (data && data.users) ? data.users : (Array.isArray(data) ? data : []);
  } else if(role === 'user'){
    myLimit = await api('/api/my-limit');
  }
}

/* ==================== 认证 API ==================== */
async function apiLogin(username, password){
  return api('/api/login', { method: 'POST', body: { username, password } });
}
async function apiLogout(){
  try{ await api('/api/logout', { method: 'POST' }); }catch(e){}
}
async function apiMe(){
  return api('/api/me');
}

/* ==================== 分类 API ==================== */
async function apiAddCategory(name){
  return api('/api/categories', { method: 'POST', body: { name } });
}
async function apiDelCategory(id){
  return api('/api/categories/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ==================== 物品 API ==================== */
async function apiAddItem(p){
  return api('/api/items', { method: 'POST', body: p });
}
async function apiUpdateItem(id, p){
  return api('/api/items/' + encodeURIComponent(id), { method: 'PUT', body: p });
}
async function apiDelItem(id){
  return api('/api/items/' + encodeURIComponent(id), { method: 'DELETE' });
}

/* ==================== 采购申请 API ==================== */
async function apiSubmitRequest(payload){
  return api('/api/requests', { method: 'POST', body: payload });
}
async function apiReview(id, action, comment){
  return api('/api/requests/' + encodeURIComponent(id) + '/review',
             { method: 'POST', body: { action, comment } });
}

/* ==================== 用户管理 API ==================== */
async function apiAddUser(p){
  return api('/api/users', { method: 'POST', body: p });
}
async function apiDelUser(name){
  return api('/api/users/' + encodeURIComponent(name), { method: 'DELETE' });
}
async function apiSetLimit(name, limit){
  return api('/api/users/' + encodeURIComponent(name) + '/limit',
             { method: 'PUT', body: { limit } });
}

/* ==================== 同步读取函数（读缓存，供页面渲染） ==================== */
function allCategories(){ return cache.categories; }

function catName(id){
  const c = cache.categories.find(c => c.id === id);
  return c ? c.name : '未分类';
}

function itemById(id){
  return cache.items.find(i => i.id === id);
}

function allItems(){
  return cache.items;
}

function loadRequests(username){
  return username
    ? cache.requests.filter(r => r.username === username)
    : cache.requests;
}

function statusText(s){ return s==='pending' ? '待审核' : s==='approved' ? '已通过' : '已驳回'; }
function statusBadge(s){ return '<span class="badge '+s+'">'+statusText(s)+'</span>'; }
function reqTotal(r){ return r.items.reduce((s,it)=>s+it.price*it.qty,0); }

/* ---- 采购限额相关（读缓存） ---- */
function _userStat(username){
  // 普通用户查看自己：用 myLimit；管理员查看用户列表：用 cache.users
  if(typeof currentUser !== 'undefined' && currentUser
     && username === currentUser.username && currentUser.role !== 'admin'){
    return myLimit;
  }
  const u = cache.users.find(u => u.username === username);
  return u || null;
}

function userLimit(username){
  const r = _userStat(username);
  return r ? (r.limit_amt || 0) : 0;
}
function userUsed(username){
  const r = _userStat(username);
  return r ? (r.used || 0) : 0;
}
function userPending(username){
  const r = _userStat(username);
  return r ? (r.pending || 0) : 0;
}
function userRemaining(username){
  const limit = userLimit(username);
  if(limit === 0) return -1;  // 无限制
  return limit - userUsed(username) - userPending(username);
}
