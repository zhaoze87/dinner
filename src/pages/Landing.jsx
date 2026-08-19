import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, loadUser, saveUser } from '../lib/api.js';

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const existing = useMemo(() => loadUser(), []);
  const [name, setName] = useState(existing?.name || '');
  const [groupName, setGroupName] = useState('今晚的饭局');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice] = useState(() => location.state?.notice || '');
  const [busy, setBusy] = useState(false);

  async function ensureUser() {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('先报上今晚怎么称呼你');
    if (existing?.id && existing.name === trimmed) return existing;
    const { user } = await api('/api/users', { method: 'POST', body: { name: trimmed } });
    return saveUser(user);
  }

  async function createGroup(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await ensureUser();
      const { group } = await api('/api/groups', {
        method: 'POST',
        body: { userId: user.id, name: groupName },
      });
      navigate(`/g/${group.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await ensureUser();
      const { group } = await api('/api/groups/join', {
        method: 'POST',
        body: { userId: user.id, code },
      });
      navigate(`/g/${group.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stage landing">
      <div className="lantern" style={{ top: 36, left: '12%' }} />
      <div className="lantern" style={{ top: 64, right: '14%', animationDelay: '-1.4s' }} />
      <div className="landing-card">
        <p className="kicker">Midnight table</p>
        <h1 className="brand">开饭</h1>
        <p className="subtitle">团长发起 · 全员加权 · 转盘按规矩出菜。今天吃过的，今晚不再翻出来。</p>
        <div className="steam-bowl" aria-hidden="true">
          <span className="puff" />
          <span className="puff" />
          <span className="puff" />
          <div className="bowl" />
        </div>
        <p className="error">{error}</p>
        {notice ? <p className="hint">{notice}</p> : null}
        <form onSubmit={createGroup}>
          <div className="field">
            <label htmlFor="name">你的称呼</label>
            <input
              id="name"
              value={name}
              maxLength={12}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：老张"
            />
          </div>
          <div className="field">
            <label htmlFor="gname">新开一桌，饭局名</label>
            <input
              id="gname"
              value={groupName}
              maxLength={20}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            我来当团长，开一桌
          </button>
        </form>
        <form onSubmit={joinGroup} style={{ marginTop: 22 }}>
          <div className="field">
            <label htmlFor="code">已有邀请码，入座</label>
            <div className="row">
              <input
                id="code"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="六位邀请码"
                style={{ flex: 1 }}
              />
              <button className="btn btn-gold" type="submit" disabled={busy}>
                入座
              </button>
            </div>
          </div>
        </form>
        <p className="hint">每人可选一道心仪的菜给它加权重；全员点过随机后，系统按权重抽一份。最近吃过的会慢慢掉权，同一天不会抽中两次。</p>
      </div>
    </div>
  );
}
