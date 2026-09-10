/* ================= 管理员：数据概览 ================= */
function viewDashboard(){
  const itemCount = cache.items.length;
  const userCount = cache.users.filter(u=>u.role==='user').length;
  const allReqs = cache.requests;
  const pendingN = allReqs.filter(r=>r.status==='pending').length;
  const approvedN = allReqs.filter(r=>r.status==='approved').length;
  const totalAmt = allReqs.filter(r=>r.status==='approved')
                          .reduce((s,r)=>s+reqTotal(r),0);
  const pending = allReqs.filter(r=>r.status==='pending').slice(0,5);
  const pendingHtml = pending.length ? pending.map(r=>
    '<tr><td>'+esc(r.no)+'</td><td>'+esc(r.username)+'</td><td>'+esc(r.date)+'</td><td>'+r.items.length+' 项</td><td>¥'+fmt(reqTotal(r))+'</td></tr>').join('')
    : '<tr><td colspan="5" style="text-align:center;color:#94a3b8">暂无待审核申请</td></tr>';
  return '<div class="page-title">数据概览</div>'
    + '<div class="stat-grid">'
    + '<div class="stat blue"><div class="lbl">物品种类</div><div class="num">'+itemCount+'</div></div>'
    + '<div class="stat blue"><div class="lbl">普通用户数</div><div class="num">'+userCount+'</div></div>'
    + '<div class="stat amber"><div class="lbl">待审核申请</div><div class="num">'+pendingN+'</div></div>'
    + '<div class="stat green"><div class="lbl">已通过申请</div><div class="num">'+approvedN+'</div></div>'
    + '<div class="stat red"><div class="lbl">已通过采购总金额</div><div class="num">¥'+fmt(totalAmt)+'</div></div>'
    + '</div>'
    + '<div class="card"><div style="font-weight:600;margin-bottom:10px">最新待审核申请</div>'
    + '<table><thead><tr><th>单号</th><th>申请人</th><th>申请时间</th><th>物品</th><th>金额</th></tr></thead><tbody>'+pendingHtml+'</tbody></table>'
    + '<div class="mt16"><button class="btn-primary" onclick="switchView(\'review\')">前往审核 →</button></div></div>'
    + '<div class="card mt16"><div style="font-weight:600;margin-bottom:10px">数据库备份</div>'
    + '<div class="muted" style="margin-bottom:10px">数据集中存储在服务器 SQLite 数据库（procurement.db），所有设备共享。可在此下载数据库备份文件用于存档或迁移；日常自动备份请参照部署教程配置服务器定时任务。</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    + '<button class="btn-green" onclick="exportDb()">💾 下载数据库备份 (.db)</button>'
    + '</div></div>';
}

function exportDb(){
  // 从服务器下载一致性备份
  const a = document.createElement('a');
  a.href = '/api/admin/backup?ts=' + Date.now();
  document.body.appendChild(a); a.click(); a.remove();
  toast('数据库备份已开始下载');
}
