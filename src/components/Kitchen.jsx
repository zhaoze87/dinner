import { useState } from 'react';
import { api } from '../lib/api.js';

const EMOJIS = ['🍖', '🍗', '🥘', '🍜', '🍲', '🥟', '🥗', '🐟', '🥚', '🍛', '🍱', '🌮', '🍕', '🍔', '🍣'];
const EMPTY_FORM = { name: '', emoji: '🍽️', category: '家常', desc: '', baseWeight: 10 };

function EmojiPicker({ value, onChange }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      {EMOJIS.map((emo) => (
        <button
          type="button"
          key={emo}
          className="btn btn-ghost"
          style={{
            padding: '6px 8px',
            borderColor: value === emo ? 'var(--oil)' : undefined,
          }}
          onClick={() => onChange(emo)}
        >
          {emo}
        </button>
      ))}
    </div>
  );
}

function MenuFields({ form, onChange }) {
  return (
    <>
      <div className="field">
        <label>菜名</label>
        <input
          value={form.name}
          maxLength={16}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="例如：水煮鱼"
        />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>分类</label>
          <input
            value={form.category}
            maxLength={8}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
          />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>基础权重</label>
          <input
            type="number"
            min="1"
            max="50"
            value={form.baseWeight}
            onChange={(e) => onChange({ ...form, baseWeight: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="field">
        <label>一句话</label>
        <input
          value={form.desc}
          maxLength={40}
          onChange={(e) => onChange({ ...form, desc: e.target.value })}
          placeholder="为什么今晚想吃它"
        />
      </div>
      <div className="field">
        <label>图标</label>
        <EmojiPicker value={form.emoji} onChange={(emoji) => onChange({ ...form, emoji })} />
      </div>
    </>
  );
}

export default function Kitchen({ group, user, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const menuApi = `/api/users/${user.id}/menus`;

  async function addMenu(event) {
    event.preventDefault();
    setError('');
    try {
      await api(menuApi, {
        method: 'POST',
        body: { ...form, userId: user.id },
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (editingId === id) setEditingId(null);
    try {
      await api(`${menuApi}/${id}?userId=${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        body: { userId: user.id },
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(menu) {
    setEditingId(menu.id);
    setEditForm({
      name: menu.name,
      emoji: menu.emoji,
      category: menu.category,
      desc: menu.desc || '',
      baseWeight: menu.baseWeight,
    });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingId) return;
    const name = editForm.name.trim();
    if (!name) {
      setError('菜名不能空');
      return;
    }
    setError('');
    try {
      await api(`${menuApi}/${editingId}`, {
        method: 'PUT',
        body: { ...editForm, name, userId: user.id },
      });
      setEditingId(null);
      setEditForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="kitchen" onClick={onClose}>
      <aside className="kitchen-panel" onClick={(e) => e.stopPropagation()}>
        <div className="topbar">
          <h2>我的菜单库</h2>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            收起
          </button>
        </div>
        <p className="rules">
          菜单绑定在你这位团长名下。在这里录入、编辑后，本桌及你之后开的团都会共用这份菜单，团员只能看和投票。
        </p>
        <p className="error">{error}</p>
        <form onSubmit={addMenu}>
          <MenuFields form={form} onChange={setForm} />
          <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>
            写进我的菜单
          </button>
        </form>
        <div className="kitchen-list">
          {group.menus.map((menu) => (
            <div className={`kitchen-item ${editingId === menu.id ? 'editing' : ''}`} key={menu.id}>
              {editingId === menu.id ? (
                <form className="kitchen-edit" onSubmit={saveEdit}>
                  <MenuFields form={editForm} onChange={setEditForm} />
                  <div className="row">
                    <button className="btn btn-gold" type="submit" style={{ flex: 1 }}>
                      保存修改
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={cancelEdit}>
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <span>{menu.emoji}</span>
                  <div>
                    <b>{menu.name}</b>
                    <div className="meta">
                      <span>{menu.category}</span>
                      <span>基础 {menu.baseWeight}</span>
                    </div>
                    {menu.desc ? <p className="kitchen-desc">{menu.desc}</p> : null}
                  </div>
                  <div className="row kitchen-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => startEdit(menu)}>
                      编辑
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => remove(menu.id)}>
                      删
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
