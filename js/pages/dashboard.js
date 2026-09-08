/* ================= 管理员：数据概览 ================= */
function viewDashboard(){
  const itemCount = one('SELECT COUNT(*) AS c FROM items').c;
  const userCount = one("SELECT COUNT(*) AS c FROM users WHERE role='user'").c;
  const pendingN = one("SELECT COUNT(*) AS c FROM requests WHERE status='pending'").c;
  const approvedN = one("SELECT COUNT(*) AS c FROM requests WHERE status='approved'").c;
  const totalAmt = one("SELECT COALESCE(SUM(ri.price*ri.qty),0) AS s FROM request_items ri JOIN requests r ON r.id=ri.request_id WHERE r.status='approved'").s;
  const pending = loadRequests().filter(r=>r.status==='pending').slice(0,5);
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
    + '<div class="card mt16"><div style="font-weight:600;margin-bottom:10px">数据库管理</div>'
    + '<div class="muted" style="margin-bottom:10px">数据存储于内嵌 SQLite 数据库（本浏览器内持久化，关闭页面/重启浏览器数据不丢失）。可导出 .db 数据库文件用于备份，或迁移到其他电脑/浏览器后在此导入恢复。</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    + '<button class="btn-green" onclick="exportDb()">💾 导出数据库文件 (.db)</button>'
    + '<label class="btn-gray" style="display:inline-flex;align-items:center;cursor:pointer">📂 导入数据库文件<input type="file" accept=".db,.sqlite,.sqlite3" style="display:none" onchange="importDb(this)"></label>'
    + '</div></div>';
}

function exportDb(){
  const blob = new Blob([sqdb.export()], {type:'application/octet-stream'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '采购管理系统数据库_' + nowStr().slice(0,10) + '.db';
  document.body.appendChild(a); a.click(); a.remove();
  toast('数据库文件已导出');
}

function importDb(input){
  const f = input.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const test = new SQL.Database(new Uint8Array(reader.result));
      const admins = test.exec("SELECT COUNT(*) FROM users WHERE role='admin'");
      if(!admins.length || !admins[0].values[0][0]) throw new Error('invalid db');
      sqdb = test; persist();
      toast('数据库导入成功'); render();
    }catch(e){ toast('导入失败：不是有效的系统数据库文件'); }
  };
  reader.readAsArrayBuffer(f);
  input.value = '';
}
