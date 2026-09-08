/* ================= 管理员：采购明细 / 导出 ================= */
let exportFilter = 'approved', exportKw = '', exportMode = 'merged';

function exportRows(){
  const kw = exportKw.trim().toLowerCase();
  return loadRequests()
    .filter(r => exportFilter==='all' || r.status===exportFilter)
    .filter(r => !kw || r.no.toLowerCase().includes(kw) || r.username.toLowerCase().includes(kw)
              || r.items.some(it=>it.name.toLowerCase().includes(kw)))
    .flatMap(r => r.items.map(it=>({r, it})));
}

function viewExport(){
  const rows = exportRows();
  const total = rows.reduce((s,x)=>s+x.it.price*x.it.qty,0);
  const opts = [['all','全部'],['approved','已通过'],['pending','待审核'],['rejected','已驳回']].map(o=>
    '<option value="'+o[0]+'"'+(exportFilter===o[0]?' selected':'')+'>'+o[1]+'</option>').join('');
  const modeOpts = [['merged','合并一个文件'],['user','按申请人分文件'],['no','按单号分文件'],['cat','按用户+物品分类分文件']].map(o=>
    '<option value="'+o[0]+'"'+(exportMode===o[0]?' selected':'')+'>'+o[1]+'</option>').join('');
  return '<div class="page-title">采购明细</div>'
    + '<div class="toolbar">状态：<select onchange="exportFilter=this.value;render()">'+opts+'</select>'
    + '<input placeholder="搜索单号 / 申请人 / 物品" value="'+esc(exportKw)+'" oninput="exportKw=this.value;renderExportTable()" style="width:200px">'
    + '<span class="spacer"></span>'
    + '导出方式：<select onchange="exportMode=this.value">'+modeOpts+'</select> '
    + '<button class="btn-green" onclick="exportCSV()">📤 导出采购清单明细 (CSV)</button></div>'
    + '<div id="exportTableWrap">'+exportTable(rows, total)+'</div>';
}

function exportTable(rows, total){
  if(!rows.length) return '<div class="card empty-tip">暂无数据</div>';
  const tr = rows.map(x=>
    '<tr><td>'+esc(x.r.no)+'</td><td>'+esc(x.r.date)+'</td><td>'+esc(x.r.username)+'</td>'
    + '<td>'+esc(x.it.name)+'</td><td>'+esc(x.it.cat_name)+'</td><td>¥'+fmt(x.it.price)+'</td><td>'+x.it.qty+'</td>'
    + '<td>¥'+fmt(x.it.price*x.it.qty)+'</td><td>'+statusBadge(x.r.status)+'</td></tr>').join('');
  return '<table><thead><tr><th>采购单号</th><th>申请时间</th><th>申请人</th><th>物品名称</th><th>分类</th><th>单价</th><th>数量</th><th>金额</th><th>状态</th></tr></thead>'
    + '<tbody>'+tr+'</tbody>'
    + '<tfoot><tr style="font-weight:700;background:#f8fafc"><td colspan="7">合计</td><td>¥'+fmt(total)+'</td><td></td></tr></tfoot></table>';
}

function renderExportTable(){
  const wrap = document.getElementById('exportTableWrap'); if(!wrap) return;
  const rows = exportRows();
  const total = rows.reduce((s,x)=>s+x.it.price*x.it.qty,0);
  wrap.innerHTML = exportTable(rows, total);
}

function csvContent(rows, title){
  const lines = [];
  if(title) lines.push(title);
  const head = ['序号','采购单号','申请时间','申请人','物品名称','分类','单位','单价(元)','数量','金额(元)','审核状态','审核意见'];
  lines.push(head.join(','));
  rows.forEach((x,i)=>{
    const row = [i+1, x.r.no, x.r.date, x.r.username, x.it.name, x.it.cat_name, x.it.unit,
      fmt(x.it.price), x.it.qty, fmt(x.it.price*x.it.qty), statusText(x.r.status), x.r.comment||''];
    lines.push(row.map(csvCell).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

function downloadCSV(filename, content){
  const blob = new Blob([content], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

function exportCSV(){
  const rows = exportRows();
  if(!rows.length){ toast('当前筛选条件下没有可导出的数据'); return; }
  const today = nowStr().slice(0,10);

  if(exportMode === 'cat'){
    // 按「用户+物品分类」分组，文件标题为"用户+物品分类 采购清单"
    const groups = {};
    rows.forEach(x=>{
      const key = x.r.username + '||' + (x.it.cat_name || '未分类');
      (groups[key] = groups[key] || []).push(x);
    });
    const names = Object.keys(groups);
    names.forEach((key, i)=>{
      const [uname, cat] = key.split('||');
      const title = uname + '+' + cat + ' 采购清单';
      const filename = safeFileName(title) + '_' + today + '.csv';
      setTimeout(()=> downloadCSV(filename, csvContent(groups[key], title)), i*400);
    });
    toast('正在按用户+物品分类导出 '+names.length+' 个文件，请在浏览器提示中选择"允许"下载多个文件');
  } else if(exportMode === 'user' || exportMode === 'no'){
    const key = exportMode === 'user' ? 'username' : 'no';
    const label = exportMode === 'user' ? '申请人' : '单号';
    const groups = {};
    rows.forEach(x=>{ (groups[x.r[key]] = groups[x.r[key]] || []).push(x); });
    const names = Object.keys(groups);
    names.forEach((name, i)=> setTimeout(()=>
      downloadCSV('采购明细_'+label+'_'+safeFileName(name)+'_'+today+'.csv', csvContent(groups[name])), i*400));
    toast('正在按'+label+'导出 '+names.length+' 个文件，请在浏览器提示中选择"允许"下载多个文件');
  } else {
    downloadCSV('采购清单明细_' + today + '.csv', csvContent(rows));
    toast('已导出 ' + rows.length + ' 条明细');
  }
}
