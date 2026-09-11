# -*- coding: utf-8 -*-
"""
采购管理系统 · 服务端
Flask + SQLite（WAL 模式）。
所有数据集中存储在服务器 procurement.db，多设备实时共享。

运行：
    开发测试：python3 app.py          （监听 0.0.0.0:8000）
    生产：     gunicorn -w 1 -b 127.0.0.1:8000 app:app
"""
import os
import uuid
import hashlib
import secrets
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (Flask, g, request, jsonify, session,
                   send_from_directory, send_file)

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, 'procurement.db')

app = Flask(__name__, static_folder=None)

# ---------------- 会话密钥（持久化到文件，重启后登录态不失效） ----------------
def _load_secret():
    path = os.path.join(BASE, 'secret_key.txt')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(key)
    return key

app.secret_key = _load_secret()


# ================= 数据库连接 =================
def db():
    """每个请求一个连接，请求结束自动关闭。"""
    if 'db' not in g:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        # WAL 模式：读不阻塞写、写不阻塞读；撞锁等待 5 秒
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()


def query(sql, params=()):
    return [dict(r) for r in db().execute(sql, params).fetchall()]


def query_one(sql, params=()):
    r = db().execute(sql, params).fetchone()
    return dict(r) if r else None


def execute(sql, params=()):
    cur = db().execute(sql, params)
    db().commit()
    return cur


# ================= 密码哈希 =================
def hash_pw(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(8)
    h = hashlib.sha256((salt + password).encode('utf-8')).hexdigest()
    return salt, h


def verify_pw(password, salt, expected):
    _, h = hash_pw(password, salt)
    return secrets.compare_digest(h, expected)


# ================= 初始化数据库结构与种子数据 =================
SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users(
        username TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        limit_amt REAL DEFAULT 5000
    )""",
    """CREATE TABLE IF NOT EXISTS categories(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    )""",
    """CREATE TABLE IF NOT EXISTS items(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cat_id TEXT NOT NULL,
        price REAL NOT NULL,
        unit TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS requests(
        id TEXT PRIMARY KEY,
        no TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT DEFAULT '',
        comment TEXT DEFAULT '',
        review_time TEXT DEFAULT ''
    )""",
    """CREATE TABLE IF NOT EXISTS request_items(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        item_id TEXT,
        name TEXT,
        cat_name TEXT,
        price REAL,
        unit TEXT,
        qty INTEGER
    )""",
    # 活跃会话表：同一用户同一时刻只允许一个活跃会话（单设备登录）
    """CREATE TABLE IF NOT EXISTS active_sessions(
        session_token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        login_time TEXT NOT NULL
    )""",
]

SEED_ITEMS = [
    ('A4复印纸(70g/500张)', '办公用品', 25.9, '包'),
    ('签字笔 0.5mm 黑色', '办公用品', 2.5, '支'),
    ('订书机', '办公用品', 15.8, '个'),
    ('文件夹(强夹力)', '办公用品', 4.2, '个'),
    ('便利贴 76×76mm', '办公用品', 3.5, '本'),
    ('白板笔(可擦)', '办公用品', 5.0, '支'),
    ('档案盒 55mm', '办公用品', 8.8, '个'),
    ('修正带', '办公用品', 4.5, '个'),
    ('抽纸(3层/8包)', '生活用品', 12.9, '提'),
    ('洗衣液 2kg', '生活用品', 29.9, '瓶'),
    ('一次性纸杯 50只', '生活用品', 9.9, '包'),
    ('垃圾袋(加厚/卷装)', '生活用品', 3.9, '卷'),
    ('洗洁精 1.1kg', '生活用品', 8.5, '瓶'),
    ('旋转拖把', '生活用品', 25.0, '把'),
    ('香皂 115g', '生活用品', 4.5, '块'),
    ('电热水壶 1.7L', '生活用品', 59.0, '个'),
]


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    for stmt in SCHEMA:
        conn.execute(stmt)
    conn.commit()
    # 首次启动：写入种子数据
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        salt_a, hash_a = hash_pw('123456')
        salt_u, hash_u = hash_pw('123456')
        conn.execute("INSERT INTO users(username,salt,password,role,limit_amt) VALUES (?,?,?,?,?)",
                     ('admin', salt_a, hash_a, 'admin', 0))
        conn.execute("INSERT INTO users(username,salt,password,role,limit_amt) VALUES (?,?,?,?,?)",
                     ('user', salt_u, hash_u, 'user', 5000))
        conn.execute("INSERT INTO categories(id,name) VALUES ('c1','办公用品'),('c2','生活用品')")
        for idx, (name, cat, price, unit) in enumerate(SEED_ITEMS, start=1):
            cat_id = 'c1' if cat == '办公用品' else 'c2'
            conn.execute("INSERT INTO items(id,name,cat_id,price,unit) VALUES (?,?,?,?,?)",
                         ('i%d' % idx, name, cat_id, price, unit))
        # 一条示例申请
        rid = 'r-seed'
        now = datetime.now().strftime('%Y-%m-%d %H:%M')
        conn.execute("INSERT INTO requests(id,no,username,date,status,note,comment,review_time) "
                     "VALUES (?,?,?,?,?,?,?,?)",
                     (rid, 'CG' + now[:10].replace('-', '') + '0001', 'user',
                      now, 'pending', '部门日常消耗补充', '', ''))
        conn.execute("INSERT INTO request_items(request_id,item_id,name,cat_name,price,unit,qty) "
                     "VALUES (?,?,?,?,?,?,?)", (rid, 'i1', 'A4复印纸(70g/500张)', '办公用品', 25.9, '包', 5))
        conn.execute("INSERT INTO request_items(request_id,item_id,name,cat_name,price,unit,qty) "
                     "VALUES (?,?,?,?,?,?,?)", (rid, 'i2', '签字笔 0.5mm 黑色', '办公用品', 2.5, '支', 20))
        conn.commit()
    conn.close()


# ================= 认证辅助 =================
def current_user():
    """返回当前登录用户 {username, role}，未登录或会话失效返回 None。
    若 session 中有 token 但数据库中不存在，说明被其他设备挤下线。
    """
    u = session.get('user')
    token = session.get('token')
    if not u or not token:
        return None
    # 校验该 token 是否仍为该用户的活跃会话
    row = query_one("SELECT username FROM active_sessions "
                    "WHERE session_token=? AND username=?",
                    (token, u['username']))
    if not row:
        # 会话已失效：被其他设备挤下线，或已登出
        session.pop('user', None)
        session.pop('token', None)
        g.kicked = True   # 标记：被挤下线
        return None
    urow = query_one("SELECT username, role FROM users WHERE username=?",
                     (u['username'],))
    return urow


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u:
            if getattr(g, 'kicked', False):
                return jsonify(error='您的账号已在其他设备登录，请重新登录'), 401
            return jsonify(error='未登录或登录已过期，请重新登录'), 401
        g.user = u
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u:
            return jsonify(error='未登录或登录已过期，请重新登录'), 401
        if u['role'] != 'admin':
            return jsonify(error='仅管理员可执行此操作'), 403
        g.user = u
        return fn(*args, **kwargs)
    return wrapper


def now_str():
    return datetime.now().strftime('%Y-%m-%d %H:%M')


# ================= 认证接口 =================
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify(ok=False, error='请输入用户名和密码'), 400
    row = query_one("SELECT * FROM users WHERE username=?", (username,))
    if not row or not verify_pw(password, row['salt'], row['password']):
        return jsonify(ok=False, error='用户名或密码错误'), 401
    # 单设备登录：清除该用户之前的所有活跃会话（挤掉旧设备）
    execute("DELETE FROM active_sessions WHERE username=?", (username,))
    # 生成新的会话令牌并记录
    token = secrets.token_hex(16)
    execute("INSERT INTO active_sessions(session_token, username, login_time) "
            "VALUES (?,?,?)", (token, username, now_str()))
    session['user'] = {'username': row['username'], 'role': row['role']}
    session['token'] = token
    return jsonify(ok=True, user={'username': row['username'], 'role': row['role']})


@app.route('/api/logout', methods=['POST'])
def api_logout():
    token = session.get('token')
    if token:
        execute("DELETE FROM active_sessions WHERE session_token=?", (token,))
    session.pop('user', None)
    session.pop('token', None)
    return jsonify(ok=True)


@app.route('/api/me')
def api_me():
    u = current_user()
    return jsonify(user={'username': u['username'], 'role': u['role']} if u else None)


@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    """已登录用户修改自己的密码：必须验证旧密码。管理员和普通用户均可用。"""
    d = request.get_json(force=True, silent=True) or {}
    old_pw = d.get('oldPassword') or ''
    new_pw = d.get('newPassword') or ''
    if not old_pw or not new_pw:
        return jsonify(error='请填写旧密码和新密码'), 400
    if len(new_pw) < 6:
        return jsonify(error='新密码长度至少 6 位'), 400
    if old_pw == new_pw:
        return jsonify(error='新密码不能与旧密码相同'), 400
    row = query_one("SELECT salt, password FROM users WHERE username=?",
                    (g.user['username'],))
    if not row or not verify_pw(old_pw, row['salt'], row['password']):
        return jsonify(error='旧密码不正确'), 400
    salt, h = hash_pw(new_pw)
    execute("UPDATE users SET salt=?, password=? WHERE username=?",
            (salt, h, g.user['username']))
    # 改密后清除该用户所有活跃会话，强制重新登录
    execute("DELETE FROM active_sessions WHERE username=?", (g.user['username'],))
    session.pop('user', None)
    session.pop('token', None)
    return jsonify(ok=True)


# ================= 分类 =================
@app.route('/api/categories')
@login_required
def list_categories():
    return jsonify(query("SELECT id, name FROM categories ORDER BY rowid"))


@app.route('/api/categories', methods=['POST'])
@admin_required
def add_category():
    name = (request.get_json(force=True, silent=True) or {}).get('name', '').strip()
    if not name:
        return jsonify(error='请输入分类名称'), 400
    if query_one("SELECT id FROM categories WHERE name=?", (name,)):
        return jsonify(error='该分类已存在'), 400
    execute("INSERT INTO categories(id,name) VALUES (?,?)", ('c' + uuid.uuid4().hex[:10], name))
    return jsonify(ok=True)


@app.route('/api/categories/<cid>', methods=['DELETE'])
@admin_required
def delete_category(cid):
    n = query_one("SELECT COUNT(*) AS c FROM items WHERE cat_id=?", (cid,))['c']
    if n:
        return jsonify(error='该分类下还有 %d 个物品，请先删除或转移' % n), 400
    execute("DELETE FROM categories WHERE id=?", (cid,))
    return jsonify(ok=True)


# ================= 物品 =================
def items_with_cat():
    return query(
        "SELECT i.id, i.name, i.cat_id, i.price, i.unit, c.name AS cat_name "
        "FROM items i LEFT JOIN categories c ON c.id=i.cat_id ORDER BY i.rowid")


@app.route('/api/items')
@login_required
def list_items():
    return jsonify(items_with_cat())


@app.route('/api/items', methods=['POST'])
@admin_required
def add_item():
    d = request.get_json(force=True, silent=True) or {}
    name = (d.get('name') or '').strip()
    cat_id = d.get('catId') or d.get('cat_id')
    try:
        price = float(d.get('price'))
    except (TypeError, ValueError):
        return jsonify(error='请输入正确的单价'), 400
    unit = (d.get('unit') or '件').strip() or '件'
    if not name:
        return jsonify(error='请输入物品名称'), 400
    if not (price >= 0):
        return jsonify(error='请输入正确的单价'), 400
    if not query_one("SELECT id FROM categories WHERE id=?", (cat_id,)):
        return jsonify(error='请选择有效分类'), 400
    execute("INSERT INTO items(id,name,cat_id,price,unit) VALUES (?,?,?,?,?)",
            ('i' + uuid.uuid4().hex[:10], name, cat_id, price, unit))
    return jsonify(ok=True)


@app.route('/api/items/<iid>', methods=['PUT'])
@admin_required
def update_item(iid):
    d = request.get_json(force=True, silent=True) or {}
    name = (d.get('name') or '').strip()
    cat_id = d.get('catId') or d.get('cat_id')
    try:
        price = float(d.get('price'))
    except (TypeError, ValueError):
        return jsonify(error='请输入正确的单价'), 400
    unit = (d.get('unit') or '件').strip() or '件'
    if not name:
        return jsonify(error='名称不能为空'), 400
    if not (price >= 0):
        return jsonify(error='请输入正确的单价'), 400
    if not query_one("SELECT id FROM items WHERE id=?", (iid,)):
        return jsonify(error='物品不存在'), 404
    if not query_one("SELECT id FROM categories WHERE id=?", (cat_id,)):
        return jsonify(error='请选择有效分类'), 400
    execute("UPDATE items SET name=?, cat_id=?, price=?, unit=? WHERE id=?",
            (name, cat_id, price, unit, iid))
    return jsonify(ok=True)


@app.route('/api/items/<iid>', methods=['DELETE'])
@admin_required
def delete_item(iid):
    execute("DELETE FROM items WHERE id=?", (iid,))
    return jsonify(ok=True)


# ================= 采购申请 =================
def requests_with_items(username=None):
    if username:
        reqs = query("SELECT * FROM requests WHERE username=? ORDER BY date DESC, rowid DESC",
                     (username,))
    else:
        reqs = query("SELECT * FROM requests ORDER BY date DESC, rowid DESC")
    items = query("SELECT * FROM request_items")
    bucket = {}
    for it in items:
        bucket.setdefault(it['request_id'], []).append(it)
    for r in reqs:
        r['items'] = bucket.get(r['id'], [])
    return reqs


def user_sums(username):
    """返回 (已通过总额, 待审核总额)。"""
    used = query_one(
        "SELECT COALESCE(SUM(ri.price*ri.qty),0) AS s FROM request_items ri "
        "JOIN requests r ON r.id=ri.request_id WHERE r.username=? AND r.status='approved'",
        (username,))['s']
    pending = query_one(
        "SELECT COALESCE(SUM(ri.price*ri.qty),0) AS s FROM request_items ri "
        "JOIN requests r ON r.id=ri.request_id WHERE r.username=? AND r.status='pending'",
        (username,))['s']
    return used, pending


@app.route('/api/requests')
@login_required
def list_requests():
    u = g.user
    if u['role'] == 'admin':
        return jsonify(requests_with_items())
    return jsonify(requests_with_items(u['username']))


@app.route('/api/requests', methods=['POST'])
@login_required
def create_request():
    u = g.user
    if u['role'] != 'user':
        return jsonify(error='仅普通用户可提交采购申请'), 403
    d = request.get_json(force=True, silent=True) or {}
    cart = d.get('items') or []
    note = (d.get('note') or '').strip()
    if not cart:
        return jsonify(error='采购车为空'), 400

    # 汇总并校验物品
    lines = []
    total = 0.0
    for c in cart:
        iid = c.get('itemId')
        try:
            qty = int(c.get('qty'))
        except (TypeError, ValueError):
            return jsonify(error='数量不正确'), 400
        if qty < 1:
            return jsonify(error='数量至少为 1'), 400
        it = query_one("SELECT i.*, c.name AS cat_name FROM items i "
                       "LEFT JOIN categories c ON c.id=i.cat_id WHERE i.id=?", (iid,))
        if not it:
            return jsonify(error='物品已下架或不存在'), 400
        amt = it['price'] * qty
        total += amt
        lines.append((iid, it['name'], it['cat_name'] or '未分类', it['price'], it['unit'], qty))

    # 限额校验（服务端强制）
    limit = query_one("SELECT limit_amt FROM users WHERE username=?", (u['username'],))['limit_amt']
    if limit and limit > 0:
        used, pending = user_sums(u['username'])
        remaining = limit - used - pending
        if total > remaining:
            return jsonify(error='本次采购 ¥%.2f 超过剩余限额 ¥%.2f，无法提交' % (total, remaining)), 400

    # 生成单号：CG + 年月日 + 当日序号(4位)
    today = datetime.now().strftime('%Y%m%d')
    prefix = 'CG' + today
    cnt = query_one("SELECT COUNT(*) AS c FROM requests WHERE no LIKE ?", (prefix + '%',))['c']
    no = prefix + str(cnt + 1).zfill(4)
    rid = 'r' + uuid.uuid4().hex
    date = now_str()
    execute("INSERT INTO requests(id,no,username,date,status,note,comment,review_time) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (rid, no, u['username'], date, 'pending', note, '', ''))
    for (iid, name, cat_name, price, unit, qty) in lines:
        execute("INSERT INTO request_items(request_id,item_id,name,cat_name,price,unit,qty) "
                "VALUES (?,?,?,?,?,?,?)",
                (rid, iid, name, cat_name, price, unit, qty))
    return jsonify(ok=True, no=no)


@app.route('/api/requests/<rid>/review', methods=['POST'])
@admin_required
def review_request(rid):
    d = request.get_json(force=True, silent=True) or {}
    action = d.get('action')
    comment = (d.get('comment') or '').strip()
    if action not in ('approved', 'rejected'):
        return jsonify(error='无效的审核操作'), 400
    req = query_one("SELECT * FROM requests WHERE id=?", (rid,))
    if not req:
        return jsonify(error='申请不存在'), 404
    if req['status'] != 'pending':
        return jsonify(error='该申请已审核，不能重复操作'), 400
    if action == 'rejected' and not comment:
        return jsonify(error='驳回时必须填写审核意见'), 400
    execute("UPDATE requests SET status=?, comment=?, review_time=? WHERE id=?",
            (action, comment, now_str(), rid))
    return jsonify(ok=True)


# ================= 限额 =================
@app.route('/api/my-limit')
@login_required
def my_limit():
    u = g.user
    limit = query_one("SELECT limit_amt FROM users WHERE username=?", (u['username'],))
    limit_amt = limit['limit_amt'] if limit else 0
    used, pending = user_sums(u['username'])
    return jsonify(limit_amt=limit_amt, used=used, pending=pending)


# ================= 用户管理 =================
@app.route('/api/users')
@admin_required
def list_users():
    users = query("SELECT username, role, limit_amt FROM users "
                  "ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, rowid")
    for u in users:
        if u['role'] == 'user':
            u['used'], u['pending'] = user_sums(u['username'])
        else:
            u['used'], u['pending'] = 0, 0
    return jsonify(users)


@app.route('/api/users', methods=['POST'])
@admin_required
def add_user():
    d = request.get_json(force=True, silent=True) or {}
    name = (d.get('name') or '').strip()
    pwd = d.get('password') or ''
    try:
        limit = float(d.get('limit'))
    except (TypeError, ValueError):
        return jsonify(error='请输入正确的采购限额（0=无限制）'), 400
    if not name or any(ch.isspace() for ch in name):
        return jsonify(error='用户名不能为空且不能含空格'), 400
    if not pwd:
        return jsonify(error='请输入密码'), 400
    if limit < 0:
        return jsonify(error='采购限额不能为负数'), 400
    if query_one("SELECT username FROM users WHERE username=?", (name,)):
        return jsonify(error='该用户名已存在'), 400
    salt, h = hash_pw(pwd)
    execute("INSERT INTO users(username,salt,password,role,limit_amt) VALUES (?,?,?,'user',?)",
            (name, salt, h, limit))
    return jsonify(ok=True)


@app.route('/api/users/<username>', methods=['DELETE'])
@admin_required
def delete_user(username):
    row = query_one("SELECT role FROM users WHERE username=?", (username,))
    if not row:
        return jsonify(error='用户不存在'), 404
    if row['role'] != 'user':
        return jsonify(error='只能删除普通用户账号'), 400
    execute("DELETE FROM users WHERE username=?", (username,))
    return jsonify(ok=True)


@app.route('/api/users/<username>/limit', methods=['PUT'])
@admin_required
def set_user_limit(username):
    d = request.get_json(force=True, silent=True) or {}
    try:
        limit = float(d.get('limit'))
    except (TypeError, ValueError):
        return jsonify(error='请输入正确的限额（0=无限制）'), 400
    if limit < 0:
        return jsonify(error='限额不能为负数'), 400
    if not query_one("SELECT username FROM users WHERE username=?", (username,)):
        return jsonify(error='用户不存在'), 404
    execute("UPDATE users SET limit_amt=? WHERE username=?", (limit, username))
    return jsonify(ok=True)


@app.route('/api/users/<username>/password', methods=['PUT'])
@admin_required
def reset_user_password(username):
    """管理员为普通用户重置密码（无需旧密码），只能重置普通用户。"""
    d = request.get_json(force=True, silent=True) or {}
    new_pw = d.get('newPassword') or ''
    if len(new_pw) < 6:
        return jsonify(error='新密码长度至少 6 位'), 400
    row = query_one("SELECT role FROM users WHERE username=?", (username,))
    if not row:
        return jsonify(error='用户不存在'), 404
    if row['role'] != 'user':
        return jsonify(error='只能重置普通用户的密码'), 400
    salt, h = hash_pw(new_pw)
    execute("UPDATE users SET salt=?, password=? WHERE username=?", (salt, h, username))
    return jsonify(ok=True)


# ================= 数据库备份（管理员） =================
@app.route('/api/admin/backup')
@admin_required
def backup_db():
    """用 SQLite 备份 API 生成一致性快照并下载。"""
    tmp = os.path.join(BASE, 'backup_download.db')
    dst = sqlite3.connect(tmp)
    try:
        db().backup(dst)
    finally:
        dst.close()
    fname = 'procurement_backup_%s.db' % datetime.now().strftime('%Y%m%d')
    return send_file(tmp, as_attachment=True, download_name=fname)


# ================= 静态前端 =================
@app.route('/')
def index():
    return send_from_directory(BASE, 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    # 只允许访问实际存在的文件，不存在返回 404
    full = os.path.join(BASE, filename)
    if not os.path.isfile(full):
        return jsonify(error='Not Found'), 404
    return send_from_directory(BASE, filename)


init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
