/* ================= 管理员：审核中心 ================= */
let reviewFilter = 'all';

function viewReview(){
  const list = loadRequests().filter(r => reviewFilter==='all' || r.status===reviewFilter);
  const opts = [['all','全部'],['pending','待审核'],['approved','已通过'],['rejected','已驳回']].map(o=>
    '<option value="'+o[0]+'"'+(reviewFilter===o[0]?' selected':'')+'>'+o[1]+'</option>').join('');
  return '<div class="page-title">审核中心</div>'
    + '<div class="toolbar">状态：<select onchange="reviewFilter=this.value;render()">'+opts+'</select>'
    + '<span class="muted">共 '+list.length+' 条</span></div>'
    + (list.length ? list.map(reviewCard).join('') : '<div class="card empty-tip">暂无申请</div>');
}

function reviewCard(r){
  const isPending = r.status==='pending';
  return '<div class="card" style="margin-bottom:12px">'
    + '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
    + '<b>'+esc(r.no)+'</b>'+statusBadge(r.status)
    + '<span class="muted">申请人：'+esc(r.username)+'　'+esc(r.date)+'</span>'
    + '<span style="margin-left:auto">合计 <b style="color:#dc2626">¥'+fmt(reqTotal(r))+'</b></span></div>'
    + (r.note ? '<div class="muted" style="margin-top:6px">备注：'+esc(r.note)+'</div>' : '')
    + '<div style="margin-top:8px">'+reqItemsTable(r)+'</div>'
    + (r.comment ? '<div style="margin-top:8px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:12.5px">审核意见：'+esc(r.comment)+'　<span class="muted">'+esc(r.review_time)+'</span></div>' : '')
    + (isPending ? '<div class="mt16" style="display:flex;gap:10px">'
        + '<button class="btn-green" onclick="openReviewModal(\''+r.id+'\',\'approved\')">✔ 通过</button>'
        + '<button class="btn-red" onclick="openReviewModal(\''+r.id+'\',\'rejected\')">✘ 驳回</button></div>' : '')
    + '</div>';
}

function openReviewModal(id, action){
  const r = loadRequests().find(r=>r.id===id);
  const no = r ? r.no : '';
  const title = action==='approved' ? '✔ 通过申请 '+no : '✘ 驳回申请 '+no;
  showModal(title,
    '<div class="form-row"><label>审核意见（'+(action==='approved'?'选填':'必填')+'）</label>'
    + '<textarea id="reviewComment" rows="3" placeholder="'+(action==='approved'?'如：同意采购':'请填写驳回原因')+'"></textarea></div>',
    [['btn-'+(action==='approved'?'green':'red'),'确认','doReview(\''+id+'\',\''+action+'\')'],['btn-gray','取消','closeModal()']]);
}

async function doReview(id, action){
  const comment = val('reviewComment').trim();
  if(action==='rejected' && !comment){ toast('驳回时必须填写审核意见'); return; }
  try{ await apiReview(id, action, comment); }
  catch(e){ toast(e.message || '审核操作失败'); return; }
  closeModal(); await refreshCache(); render();
  toast(action==='approved' ? '已通过该采购申请' : '已驳回该采购申请');
}
