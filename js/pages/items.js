/* ================= 管理员：物品管理 ================= */
function viewItems(){
  const cats = q('SELECT * FROM categories ORDER BY rowid');
  const items = allItems();
  const catChips = cats.map(c=>
    '<span class="cat-chip">'+esc(c.name)+'<b title="删除分类" onclick="delCategory(\''+c.id+'\')">✕</b></span>').join('');
  const rows = items.map(i=>
    '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.cat_name || '未分类')+'</td><td>¥'+fmt(i.price)+'</td><td>'+esc(i.unit)+'</td>'
    + '<td><button class="btn-gray btn-sm" onclick="openItemModal(\''+i.id+'\')">编辑</button> '
    + '<button class="btn-red btn-sm" onclick="delItem(\''+i.id+'\')">删除</button></td></tr>').join('');
  const opts = cats.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  return '<div class="page-title">物品管理</div>'
    + '<div class="card" style="margin-bottom:16px"><div style="font-weight:600;margin-bottom:10px">物品种类（分类）</div>'
    + catChips
    + '<div class="inline-form" style="margin-top:6px"><input id="newCatName" placeholder="新分类名称" style="width:180px">'
    + '<button class="btn-primary" onclick="addCategory()">＋ 添加分类</button></div></div>'
    + '<div class="card"><div style="font-weight:600;margin-bottom:12px">物品列表（'+items.length+'）</div>'
    + '<div class="inline-form" style="margin-bottom:12px">'
    + '<input id="newItemName" placeholder="物品名称" style="width:200px">'
    + '<select id="newItemCat">'+opts+'</select>'
    + '<input id="newItemPrice" type="number" min="0" step="0.1" placeholder="单价(元)" style="width:100px">'
    + '<input id="newItemUnit" placeholder="单位" style="width:80px">'
    + '<button class="btn-primary" onclick="addItem()">＋ 添加物品</button></div>'
    + '<table><thead><tr><th>名称</th><th>分类</th><th>单价</th><th>单位</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function addCategory(){
  const name = val('newCatName').trim();
  if(!name){ toast('请输入分类名称'); return; }
  if(one('SELECT id FROM categories WHERE name=?',[name])){ toast('该分类已存在'); return; }
  tx(()=> run('INSERT INTO categories VALUES (?,?)',[genId('c'),name]));
  render(); toast('分类已添加');
}

function delCategory(id){
  const n = one('SELECT COUNT(*) AS c FROM items WHERE cat_id=?',[id]).c;
  if(n){ toast('该分类下还有 '+n+' 个物品，请先删除或转移'); return; }
  const c = one('SELECT name FROM categories WHERE id=?',[id]);
  if(!confirm('确定删除分类「'+c.name+'」吗？')) return;
  tx(()=> run('DELETE FROM categories WHERE id=?',[id]));
  render(); toast('分类已删除');
}

function addItem(){
  const name = val('newItemName').trim();
  const catId = val('newItemCat');
  const price = parseFloat(val('newItemPrice'));
  const unit = val('newItemUnit').trim() || '件';
  if(!name){ toast('请输入物品名称'); return; }
  if(!(price>=0)){ toast('请输入正确的单价'); return; }
  tx(()=> run('INSERT INTO items VALUES (?,?,?,?,?)',[genId('i'),name,catId,price,unit]));
  render(); toast('物品已添加');
}

function delItem(id){
  const it = itemById(id);
  if(!confirm('确定删除物品「'+it.name+'」吗？')) return;
  tx(()=> run('DELETE FROM items WHERE id=?',[id]));
  cart = cart.filter(c=>c.itemId!==id); saveCart();
  render(); toast('物品已删除');
}

function openItemModal(id){
  const it = itemById(id);
  const opts = q('SELECT * FROM categories ORDER BY rowid').map(c=>
    '<option value="'+c.id+'"'+(c.id===it.cat_id?' selected':'')+'>'+esc(c.name)+'</option>').join('');
  showModal('编辑物品',
    '<div class="form-row"><label>名称</label><input id="editName" value="'+esc(it.name)+'"></div>'
    + '<div class="form-row"><label>分类</label><select id="editCat">'+opts+'</select></div>'
    + '<div class="form-row"><label>单价（元）</label><input id="editPrice" type="number" min="0" step="0.1" value="'+it.price+'"></div>'
    + '<div class="form-row"><label>单位</label><input id="editUnit" value="'+esc(it.unit)+'"></div>',
    [['btn-primary','保存','saveItem(\''+id+'\')'],['btn-gray','取消','closeModal()']]);
}

function saveItem(id){
  const name = val('editName').trim();
  const price = parseFloat(val('editPrice'));
  if(!name){ toast('名称不能为空'); return; }
  if(!(price>=0)){ toast('请输入正确的单价'); return; }
  tx(()=> run('UPDATE items SET name=?, cat_id=?, price=?, unit=? WHERE id=?',
    [name, val('editCat'), price, val('editUnit').trim() || '件', id]));
  closeModal(); render(); toast('物品已更新');
}
