import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, clearRoom, loadRoom, loadUser, saveRoom, saveUser } from '../lib/api.js';

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteFromLink = (searchParams.get('join') || '').trim().toUpperCase();
  const existing = useMemo(() => loadUser(), []);
  const savedRoom = useMemo(() => loadRoom(), []);
  const [name, setName] = useState(existing?.name || '');
  const [groupName, setGroupName] = useState(savedRoom?.name || '今晚的饭局');
  const [code, setCode] = useState(inviteFromLink);
  const [error, setError] = useState('');
  const [notice] = useState(() => location.state?.notice || '');
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(false);

  // 重启/刷新后自动回到上次的桌
  useEffect(() => {
    if (inviteFromLink) return undefined;
    const user = loadUser();
    const room = loadRoom();
    if (!user?.id || !room?.code) return undefined;

    let cancelled = false;
    setResuming(true);
    api('/api/groups/join', { method: 'POST', body: { userId: user.id, code: room.code } })
      .then(({ group }) => {
        if (cancelled) return;
        saveRoom(group);
        navigate(`/g/${group.code}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          clearRoom();
          setResuming(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteFromLink, navigate]);

  async function ensureUser() {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('先报上今晚怎么称呼你');
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
      saveRoom(group);
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
      const invite = (code || inviteFromLink).trim().toUpperCase();
      if (!invite) throw new Error('先填邀请码，或打开分享链接');
      const user = await ensureUser();
      const { group } = await api('/api/groups/join', {
        method: 'POST',
        body: { userId: user.id, code: invite },
      });
      saveRoom(group);
      navigate(`/g/${group.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resumeRoom() {
    const room = loadRoom();
    if (!room?.code) return;
    setBusy(true);
    setError('');
    try {
      const user = await ensureUser();
      const { group } = await api('/api/groups/join', {
        method: 'POST',
        body: { userId: user.id, code: room.code },
      });
      saveRoom(group);
      navigate(`/g/${group.code}`);
    } catch (err) {
      clearRoom();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (resuming) {
    return (
      <div className="stage landing">
        <p className="subtitle">正在回到你的桌……</p>
      </div>
    );
  }

  // 带 ?join=邀请码 进来：只填名字入座
  if (inviteFromLink) {
    return (
      <div className="stage landing">
        <div className="lantern" style={{ top: 36, left: '12%' }} />
        <div className="lantern" style={{ top: 64, right: '14%', animationDelay: '-1.4s' }} />
        <div className="landing-card">
          <p className="kicker">Invite seat</p>
          <h1 className="brand">入座</h1>
          <p className="subtitle">有人请你来开饭。报上称呼即可入座，不用再填邀请码。</p>
          <div className="invite" style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>本桌邀请码</div>
            <b>{inviteFromLink}</b>
          </div>
          <p className="error">{error}</p>
          {notice ? <p className="hint">{notice}</p> : null}
          <form onSubmit={joinGroup}>
            <div className="field">
              <label htmlFor="name">你的称呼</label>
              <input
                id="name"
                value={name}
                maxLength={12}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：老张"
                autoFocus
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? '入座中…' : '入座开饭'}
            </button>
          </form>
        </div>
      </div>
    );
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
        {savedRoom?.code ? (
          <div style={{ marginBottom: 18 }}>
            <button
              className="btn btn-gold"
              type="button"
              disabled={busy}
              onClick={resumeRoom}
              style={{ width: '100%' }}
            >
              回到我的桌 · {savedRoom.code}
            </button>
            <p className="hint" style={{ marginTop: 8 }}>
              分享码不变，重启后也能直接回到这桌。
            </p>
          </div>
        ) : null}
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
            <label htmlFor="gname">饭局名</label>
            <input
              id="gname"
              value={groupName}
              maxLength={20}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {savedRoom?.code ? '进入我的桌（沿用原邀请码）' : '我来当团长，开一桌'}
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
