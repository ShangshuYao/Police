/* ================= 管理员：用户管理 ================= */
function viewUsers(){
  const users = q("SELECT username, role, limit_amt FROM users ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, rowid");
  const rows = users.map(u=>{
    const used = u.role==='user' ? userUsed(u.username) : 0;
    const pending = u.role==='user' ? userPending(u.username) : 0;
    const limitStr = u.role==='user'
      ? (u.limit_amt===0 ? '无限制' : '¥'+fmt(u.limit_amt))
      : '—';
    const usedStr = u.role==='user' ? '¥'+fmt(used) : '—';
    const pendingStr = u.role==='user' ? '¥'+fmt(pending) : '—';
    return '<tr><td>'+esc(u.username)+'</td>'
      + '<td>'+(u.role==='admin' ? '<span class="badge approved">管理员</span>' : '<span class="badge pending">普通用户</span>')+'</td>'
      + '<td>'+limitStr+'</td>'
      + '<td>'+usedStr+'</td>'
      + '<td>'+pendingStr+'</td>'
      + '<td>'+(u.role==='user'
          ? '<button class="btn-gray btn-sm" onclick="openLimitModal(\''+esc(u.username)+'\')">设置限额</button> '
            + '<button class="btn-red btn-sm" onclick="delUser(\''+esc(u.username)+'\')">删除</button>'
          : '<span class="muted">—</span>')+'</td></tr>';
  }).join('');
  return '<div class="page-title">用户管理</div>'
    + '<div class="card" style="margin-bottom:16px"><div style="font-weight:600;margin-bottom:12px">添加普通用户</div>'
    + '<div class="inline-form">'
    + '<input id="newUserName" placeholder="用户名（不含空格）" style="width:180px">'
    + '<input id="newUserPwd" type="text" placeholder="密码" style="width:150px">'
    + '<input id="newUserLimit" type="number" min="0" step="100" value="5000" placeholder="采购限额(元)" style="width:130px" title="0 表示无限制">'
    + '<button class="btn-primary" onclick="addUser()">＋ 添加用户</button></div>'
    + '<div class="muted" style="margin-top:8px">采购限额为 0 表示无限制。用户提交申请时，系统会自动校验「已通过+待审核」金额是否超出限额。</div></div>'
    + '<div class="card"><div style="font-weight:600;margin-bottom:12px">用户列表（'+users.length+'）</div>'
    + '<table><thead><tr><th>用户名</th><th>角色</th><th>采购限额</th><th>已通过</th><th>待审核</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table>'
    + '<div class="muted" style="margin-top:10px">删除用户后，该用户的历史采购申请将保留用于追溯。</div></div>';
}

function addUser(){
  const name = val('newUserName').trim();
  const pwd = val('newUserPwd');
  const limit = parseFloat(val('newUserLimit'));
  if(!name || /\s/.test(name)){ toast('用户名不能为空且不能含空格'); return; }
  if(!pwd){ toast('请输入密码'); return; }
  if(!(limit>=0)){ toast('请输入正确的采购限额（0=无限制）'); return; }
  if(one('SELECT username FROM users WHERE username=?',[name])){ toast('该用户名已存在'); return; }
  tx(()=> run("INSERT INTO users(username,password,role,limit_amt) VALUES (?,?,'user',?)",[name,pwd,limit]));
  render(); toast('用户「'+name+'」已添加');
}

function delUser(name){
  const u = one('SELECT role FROM users WHERE username=?',[name]);
  if(!u || u.role!=='user'){ toast('只能删除普通用户账号'); return; }
  if(!confirm('确定删除用户「'+name+'」吗？\n其历史采购申请将保留。')) return;
  tx(()=> run('DELETE FROM users WHERE username=?',[name]));
  localStorage.removeItem('pm_cart_'+name);
  render(); toast('用户「'+name+'」已删除');
}

function openLimitModal(username){
  const u = one('SELECT limit_amt FROM users WHERE username=?',[username]);
  if(!u) return;
  const used = userUsed(username);
  const pending = userPending(username);
  const remaining = u.limit_amt===0 ? -1 : u.limit_amt - used - pending;
  showModal('设置采购限额 · '+username,
    '<div class="muted" style="margin-bottom:12px">'
    + '已通过采购金额：¥'+fmt(used)+'　待审核金额：¥'+fmt(pending)
    + (u.limit_amt===0 ? '' : '　剩余：¥'+fmt(remaining))
    + '</div>'
    + '<div class="form-row"><label>采购限额（元）</label>'
    + '<input id="editLimit" type="number" min="0" step="100" value="'+u.limit_amt+'" placeholder="0 表示无限制"></div>'
    + '<div class="muted" style="font-size:13px">设为 0 表示无限制；用户提交申请时将校验「已通过+待审核」金额不超此限额。</div>',
    [['btn-primary','保存','saveLimit(\''+esc(username)+'\')'],['btn-gray','取消','closeModal()']]);
}

function saveLimit(username){
  const limit = parseFloat(val('editLimit'));
  if(!(limit>=0)){ toast('请输入正确的限额（0=无限制）'); return; }
  tx(()=> run('UPDATE users SET limit_amt=? WHERE username=?',[limit,username]));
  closeModal(); render();
  toast('已更新「'+username+'」的采购限额为'+(limit===0?'无限制':'¥'+fmt(limit)));
}
