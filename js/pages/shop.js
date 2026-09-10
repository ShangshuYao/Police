/* ================= 普通用户：采购大厅 ================= */
let shopCat = 'all', shopKw = '';

function viewShop(){
  const tabs = ['<div class="cat-tab'+(shopCat==='all'?' active':'')+'" onclick="setShopCat(\'all\')">全部</div>']
    .concat(allCategories().map(c=>
      '<div class="cat-tab'+(shopCat===c.id?' active':'')+'" onclick="setShopCat(\''+c.id+'\')">'+esc(c.name)+'</div>'));
  // 限额信息
  const limit = userLimit(currentUser.username);
  const used = userUsed(currentUser.username);
  const pending = userPending(currentUser.username);
  const remaining = limit - used - pending;
  let limitHtml;
  if(limit === 0){
    limitHtml = '<div class="limit-info">采购限额：<b>无限制</b></div>';
  } else {
    limitHtml = '<div class="limit-info">采购限额：<b>¥'+fmt(limit)+'</b>'
      + '　已通过：<span style="color:#16a34a">¥'+fmt(used)+'</span>'
      + '　待审核：<span style="color:#d97706">¥'+fmt(pending)+'</span>'
      + '　剩余：<span style="color:'+(remaining<0?'#dc2626':'#2563eb')+';font-weight:700">¥'+fmt(remaining)+'</span></div>';
  }
  return '<div class="page-title">采购大厅</div>'
    + limitHtml
    + '<div class="shop-bar"><div class="cat-tabs">'+tabs.join('')+'</div>'
    + '<input style="margin-left:auto;width:220px" placeholder="搜索物品名称…" value="'+esc(shopKw)+'" oninput="shopKw=this.value;renderShopGrid()" id="shopKwInput"></div>'
    + '<div class="goods-grid" id="goodsGrid">'+goodsGrid(filteredItems())+'</div>';
}

function filteredItems(){
  const kw = shopKw.trim();
  return allItems().filter(i => (shopCat==='all' || i.cat_id===shopCat) && (!kw || i.name.includes(kw)));
}

function goodsGrid(list){
  if(!list.length) return '<div class="empty-tip">暂无相关物品</div>';
  return list.map(i=>
    '<div class="goods">'
    + '<span class="cat">'+esc(i.cat_name || '未分类')+'</span>'
    + '<div class="name">'+esc(i.name)+'</div>'
    + '<div class="row"><span class="price">¥'+fmt(i.price)+' <small>/'+esc(i.unit)+'</small></span>'
    + '<input type="number" min="1" value="1" class="qty" id="qty_'+i.id+'">'
    + '<button class="btn-primary btn-sm" onclick="addToCart(\''+i.id+'\')">加入</button></div></div>'
  ).join('');
}

function setShopCat(id){ shopCat = id; render(); }

function renderShopGrid(){
  const grid = document.getElementById('goodsGrid'); if(!grid) return;
  grid.innerHTML = goodsGrid(filteredItems());
}

function addToCart(itemId){
  const qty = parseInt(val('qty_'+itemId), 10);
  if(!(qty>=1)){ toast('请输入正确的数量'); return; }
  const exist = cart.find(c=>c.itemId===itemId);
  if(exist) exist.qty += qty; else cart.push({itemId, qty});
  saveCart(); updateCartCount(); toast('已加入采购车');
}

function openCartModal(){
  if(!cart.length){ toast('采购车为空，请先选择物品'); return; }
  const rows = cart.map((c,idx)=>{
    const it = itemById(c.itemId);
    return '<tr><td>'+esc(it.name)+'</td><td>¥'+fmt(it.price)+'/'+esc(it.unit)+'</td>'
      + '<td><input type="number" min="1" value="'+c.qty+'" style="width:60px" onchange="cartQty('+idx+',this.value)"></td>'
      + '<td>¥'+fmt(it.price*c.qty)+'</td>'
      + '<td><button class="btn-red btn-sm" onclick="cartRemove('+idx+')">删除</button></td></tr>';
  }).join('');
  const total = cart.reduce((s,c)=>{ const it=itemById(c.itemId); return s+it.price*c.qty; },0);
  // 限额提示
  const limit = userLimit(currentUser.username);
  const remaining = userRemaining(currentUser.username);
  let limitTip = '';
  if(limit > 0){
    if(total > remaining){
      limitTip = '<div style="margin-top:8px;padding:8px 12px;background:#fef2f2;border-radius:6px;color:#dc2626;font-size:13px">'
        + '⚠ 本次采购 ¥'+fmt(total)+' 超过剩余限额 ¥'+fmt(remaining)+'，无法提交！请减少采购数量或删除部分物品。</div>';
    } else {
      limitTip = '<div style="margin-top:8px;padding:8px 12px;background:#f0fdf4;border-radius:6px;color:#16a34a;font-size:13px">'
        + '本次采购后剩余限额：¥'+fmt(remaining - total)+'</div>';
    }
  }
  showModal('采购车确认',
    '<table><thead><tr><th>物品</th><th>单价</th><th>数量</th><th>金额</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'
    + '<div style="text-align:right;margin-top:12px;font-size:15px">合计：<b style="color:#dc2626">¥'+fmt(total)+'</b></div>'
    + limitTip
    + '<div class="form-row" style="margin-top:8px"><label>申请备注（选填）</label><textarea id="reqNote" rows="2" placeholder="如：部门日常补充"></textarea></div>',
    [['btn-primary','提交采购申请','submitRequest()'],['btn-gray','取消','closeModal()']]);
}

function cartQty(idx, v){
  const n = parseInt(v,10); if(!(n>=1)){ toast('数量至少为1'); return; }
  cart[idx].qty = n; saveCart(); updateCartCount();
}

function cartRemove(idx){
  cart.splice(idx,1); saveCart(); updateCartCount();
  if(!cart.length){ closeModal(); } else { openCartModal(); }
}

async function submitRequest(){
  if(!cart.length){ toast('采购车为空'); return; }
  // 限额前端预校验（服务端会再次强制校验）
  const limit = userLimit(currentUser.username);
  if(limit > 0){
    const total = cart.reduce((s,c)=>{ const it=itemById(c.itemId); return s+it.price*c.qty; },0);
    const remaining = userRemaining(currentUser.username);
    if(total > remaining){
      toast('本次采购 ¥'+fmt(total)+' 超过剩余限额 ¥'+fmt(remaining)+'，无法提交');
      return;
    }
  }
  const note = val('reqNote').trim();
  const payload = {
    note: note,
    items: cart.map(c=>({ itemId: c.itemId, qty: c.qty }))
  };
  try{
    await apiSubmitRequest(payload);
  }catch(e){
    toast(e.message || '提交失败，请稍后重试');
    return;
  }
  cart = []; saveCart(); updateCartCount(); closeModal();
  await refreshCache();
  toast('采购申请已提交，等待管理员审核');
  view = 'myreq'; render();
}
