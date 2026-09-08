/* ================= 普通用户：我的申请 ================= */
function viewMyRequests(){
  const mine = loadRequests(currentUser.username);
  if(!mine.length) return '<div class="page-title">我的申请</div><div class="card empty-tip">还没有采购申请，去<a href="javascript:void(0)" onclick="switchView(\'shop\')" style="color:#2563eb">采购大厅</a>看看吧</div>';
  return '<div class="page-title">我的申请</div>' + mine.map(requestCard).join('');
}

function requestCard(r){
  return '<div class="card" style="margin-bottom:12px">'
    + '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
    + '<b>'+esc(r.no)+'</b>'+statusBadge(r.status)
    + '<span class="muted">'+esc(r.date)+'</span>'
    + '<span style="margin-left:auto">合计 <b style="color:#dc2626">¥'+fmt(reqTotal(r))+'</b></span></div>'
    + (r.note ? '<div class="muted" style="margin-top:6px">备注：'+esc(r.note)+'</div>' : '')
    + '<details style="margin-top:8px"><summary>查看物品明细（'+r.items.length+'项）</summary>'
    + reqItemsTable(r) + '</details>'
    + (r.comment ? '<div style="margin-top:8px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:12.5px">审核意见：'+esc(r.comment)+'</div>' : '')
    + '</div>';
}

function reqItemsTable(r){
  return '<table><thead><tr><th>物品</th><th>分类</th><th>单价</th><th>数量</th><th>金额</th></tr></thead><tbody>'
    + r.items.map(it=>'<tr><td>'+esc(it.name)+'</td><td>'+esc(it.cat_name)+'</td><td>¥'+fmt(it.price)+'/'+esc(it.unit)+'</td><td>'+it.qty+'</td><td>¥'+fmt(it.price*it.qty)+'</td></tr>').join('')
    + '</tbody></table>';
}
