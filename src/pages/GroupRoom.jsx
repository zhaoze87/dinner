import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, clearRoom, loadUser, saveRoom, saveUser } from '../lib/api.js';
import { roomActions, startRoomSync } from '../lib/realtime.js';
import Kitchen from '../components/Kitchen.jsx';
import Toasts from '../components/Toasts.jsx';
import Wheel from '../components/Wheel.jsx';

function hue(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 62%)`;
}

function formatWhen(at) {
  return new Date(at).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 对外公开权重 + 仅自己累计选票加成（本地展示，不泄露他人选择） */
function displayWeightForMenu(row, menu, myCount, voteBoost) {
  const base = row?.base ?? menu.baseWeight ?? 0;
  const pickedToday = Boolean(row?.pickedToday);
  const recency = pickedToday ? 0 : (row?.recency ?? 1);
  const count = Math.max(0, Number(myCount) || 0);
  const personalBoost = count * voteBoost;
  const weight = pickedToday ? 0 : Number(((base + personalBoost) * recency).toFixed(2));
  const decayPct = pickedToday ? 100 : Math.round((1 - recency) * 100);
  return {
    base,
    recency,
    pickedToday,
    myCount: count,
    personalBoost,
    weight,
    decayPct,
  };
}

function inviteLink(code) {
  return `${window.location.origin}/g/${encodeURIComponent(code)}`;
}

export default function GroupRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => loadUser());
  const [joinName, setJoinName] = useState(() => loadUser()?.name || '');
  const [joining, setJoining] = useState(false);
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [kitchen, setKitchen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [copied, setCopied] = useState(false);
  const [feishuUrl, setFeishuUrl] = useState('');
  const [feishuBusy, setFeishuBusy] = useState(false);
  const [feishuMsg, setFeishuMsg] = useState('');
  const [auditId, setAuditId] = useState(null);

  const isLeader = group?.leaderId === user?.id;
  const session = group?.session;
  const myVote = session?.votes.find((v) => v.userId === user?.id);
  const myReady = session?.ready?.includes(user?.id);
  const weights = session?.weights || group?.weights || [];
  const voteBoost = group?.rules?.VOTE_BOOST ?? 20;
  const myVoteCounts = group?.myVoteCounts || {};

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    async function boot() {
      try {
        const { group: next } = await api('/api/groups/join', {
          method: 'POST',
          body: { userId: user.id, code },
        });
        if (alive) {
          setGroup(next);
          saveRoom(next);
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    }

    boot();

    const stop = startRoomSync({
      code,
      userId: user.id,
      onGroup: (next) => {
        if (!next.members.some((m) => m.userId === user.id)) {
          clearRoom();
          navigate('/', { replace: true, state: { notice: '你已被移出本桌' } });
          return;
        }
        saveRoom(next);
        setGroup(next);
      },
      onNotify: (item) => {
        setToasts((prev) => {
          if (prev.some((x) => x.id === item.id)) return prev;
          return [...prev.slice(-39), item];
        });
        if (
          item.type === 'session-start'
          && typeof Notification !== 'undefined'
          && Notification.permission === 'granted'
        ) {
          new Notification(item.title, { body: item.message });
        }
      },
      onKicked: ({ message }) => {
        clearRoom();
        navigate('/', { replace: true, state: { notice: message || '你已被移出本桌' } });
      },
      onError: (message) => setError(message),
    });

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      alive = false;
      stop();
    };
  }, [code, navigate, user?.id]);

  async function enterWithName(event) {
    event.preventDefault();
    const trimmed = joinName.trim();
    if (!trimmed) {
      setError('先报上今晚怎么称呼你');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const { user: next } = await api('/api/users', { method: 'POST', body: { name: trimmed } });
      saveUser(next);
      setUser(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  }

  async function runAction(action) {
    setError('');
    try {
      const next = await action();
      if (next) setGroup(next);
    } catch (err) {
      setError(err.message);
    }
  }

  function kickMember(member) {
    if (!window.confirm(`确定把 ${member.name} 请离本桌？`)) return;
    runAction(() => roomActions.kick(code, user.id, member.userId));
  }

  async function shareInvite() {
    const link = inviteLink(group.code);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `开饭 · ${group.name}`,
          text: `来入座吧，邀请码 ${group.code}`,
          url: link,
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        setCopied(false);
      }
    }
  }

  async function saveFeishu(event) {
    event.preventDefault();
    setFeishuBusy(true);
    setFeishuMsg('');
    setError('');
    try {
      const next = await roomActions.saveFeishu(code, user.id, feishuUrl.trim());
      setGroup(next);
      setFeishuUrl('');
      setFeishuMsg(next.hasFeishuWebhook ? '飞书 Webhook 已保存' : '已清空飞书 Webhook');
    } catch (err) {
      setError(err.message);
    } finally {
      setFeishuBusy(false);
    }
  }

  async function sendFeishu() {
    setFeishuBusy(true);
    setFeishuMsg('');
    setError('');
    try {
      const next = await roomActions.notifyFeishu(code, user.id);
      if (next) setGroup(next);
      setFeishuMsg('已发到飞书群');
    } catch (err) {
      setError(err.message);
    } finally {
      setFeishuBusy(false);
    }
  }

  // 分享链接打开、尚未报名字：只填称呼即可入座
  if (!user?.id) {
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
            <b>{String(code || '').toUpperCase()}</b>
          </div>
          <p className="error">{error}</p>
          <form onSubmit={enterWithName}>
            <div className="field">
              <label htmlFor="join-name">你的称呼</label>
              <input
                id="join-name"
                value={joinName}
                maxLength={12}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder="例如：老张"
                autoFocus
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={joining} style={{ width: '100%' }}>
              {joining ? '入座中…' : '入座开饭'}
            </button>
          </form>
          <p className="hint" style={{ marginTop: 16 }}>
            <Link to="/">回门口自己开桌</Link>
          </p>
        </div>
      </div>
    );
  }

  if (error && !group) {
    return (
      <div className="stage landing">
        <div className="landing-card">
          <h1 className="brand">走错桌了</h1>
          <p>{error}</p>
          <Link className="btn btn-primary" to="/" style={{ display: 'inline-block', marginTop: 16 }}>
            回门口
          </Link>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="stage landing">
        <p className="subtitle">正在摆桌……</p>
      </div>
    );
  }

  const showingWheel = session && ['spinning', 'revealing', 'completed', 'failed'].includes(session.status);

  return (
    <div className="stage room">
      <aside className="side">
        <div>
          <p className="kicker">Kai Fan</p>
          <h1 className="side-brand">开饭</h1>
          <p className="group-name">{group.name}</p>
        </div>
        <div className="invite">
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>邀请码</div>
          <b>{group.code}</b>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, wordBreak: 'break-all' }}>
            {inviteLink(group.code)}
          </div>
          <div>
            <button className="btn btn-ghost" type="button" onClick={shareInvite} style={{ marginTop: 8 }}>
              {copied ? '链接已复制' : '分享邀请链接'}
            </button>
          </div>
          {isLeader ? (
            <form className="feishu-box" onSubmit={saveFeishu}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>飞书群 Webhook</div>
              {group.hasFeishuWebhook ? (
                <div className="feishu-status">已接入 · {group.feishuWebhookMasked || '机器人已配置'}</div>
              ) : (
                <div className="feishu-status muted">未设置，发起点餐时不会通知飞书群</div>
              )}
              <input
                type="password"
                value={feishuUrl}
                onChange={(e) => setFeishuUrl(e.target.value)}
                placeholder="粘贴飞书自定义机器人 Webhook"
                autoComplete="off"
              />
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <button className="btn btn-ghost" type="submit" disabled={feishuBusy}>
                  {feishuUrl.trim() ? '保存' : (group.hasFeishuWebhook ? '清空' : '保存')}
                </button>
                {group.hasFeishuWebhook ? (
                  <button className="btn btn-gold" type="button" disabled={feishuBusy} onClick={sendFeishu}>
                    通知飞书群
                  </button>
                ) : null}
              </div>
              {feishuMsg ? <p className="hint" style={{ marginTop: 8 }}>{feishuMsg}</p> : null}
            </form>
          ) : null}
        </div>
        <div>
          <div className="kicker">在座</div>
          <div className="member-list">
            {group.members.map((member) => (
              <div className="member" key={member.userId}>
                <span className="avatar" style={{ background: hue(member.name) }}>
                  {member.name.slice(0, 1)}
                </span>
                <div style={{ flex: 1 }}>
                  <div>{member.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {session
                      ? `${(session.votedUserIds || session.votes.map((v) => v.userId)).includes(member.userId) ? '已选中' : '还没选'}${session.ready?.includes(member.userId) ? ' · 已随机' : ''}`
                      : '在座'}
                  </div>
                </div>
                {member.isLeader ? <span className="tag">团长</span> : null}
                {isLeader && !member.isLeader ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-kick"
                    title={`请离 ${member.name}`}
                    onClick={() => kickMember(member)}
                  >
                    剔除
                  </button>
                ) : null}
                <span className={`dot ${member.online ? 'on' : ''}`} />
              </div>
            ))}
          </div>
        </div>
        <p className="rules">
          每轮选中 +{group.rules.VOTE_BOOST} 权重，未抽中会累计到下一轮；开奖时计入全员累计票，抽中后该菜累计清空。近{' '}
          {group.rules.DECAY_DAYS} 天抽中过的会掉权，同一天不重复。他人选中次数仅自己可见。
        </p>
        <Link to="/" className="btn btn-ghost" onClick={clearRoom}>
          换一桌
        </Link>
      </aside>

      <main className="main">
        <div className="topbar">
          <h2>{session ? '这轮点餐' : `${group.leaderName} 的菜单`}</h2>
          <div className="actions">
            {isLeader ? (
              <button className="btn btn-ghost" type="button" onClick={() => setKitchen(true)}>
                我的菜单库
              </button>
            ) : null}
            {isLeader && !session ? (
              <button className="btn btn-primary" type="button" onClick={() => runAction(() => roomActions.start(code, user.id))}>
                发起点餐
              </button>
            ) : null}
            {isLeader && session?.status === 'voting' ? (
              <button className="btn btn-gold" type="button" onClick={() => runAction(() => roomActions.lock(code, user.id))}>
                开始随机点餐
              </button>
            ) : null}
          </div>
        </div>

        {session?.status === 'voting' ? (
          <div className="session-banner">
            <div>
              <b>团长敲桌了，先给心仪的菜加权重。</b>
              <div className="rules">每人每轮一道，可改选。未中奖的选中会累计到下一轮；开奖计入全员累计，抽中后清空。其他人只知道你已选中，看不到你选了什么。</div>
            </div>
            <div>{(session.voteCount ?? session.votedUserIds?.length ?? session.votes.length)}/{group.members.length} 人已选</div>
          </div>
        ) : null}

        {session?.status === 'spinning' ? (
          <div className="session-banner">
            <div>
              <b>随机阶段：所有团员（含团长）都要点一下。</b>
              <div className="rules">全员到齐后按权重出菜。有人没到，团长可以先开抽。</div>
            </div>
            <div>{session.ready.length}/{group.members.length} 人已随机</div>
          </div>
        ) : null}

        {!isLeader && !session ? (
          <p className="rules" style={{ marginBottom: 18 }}>
            当前展示的是团长 {group.leaderName} 的个人菜单，团员可以投票但不能修改。
          </p>
        ) : null}

        <p className="error">{error}</p>

        <section className="board">
          {group.menus.map((menu) => {
            const row = weights.find((w) => w.menuId === menu.id);
            const picked = myVote?.menuId === menu.id;
            const view = displayWeightForMenu(row, menu, myVoteCounts[menu.id] || 0, voteBoost);
            return (
              <button
                key={menu.id}
                type="button"
                className={`dish ${session?.status === 'voting' ? 'pickable' : ''} ${picked ? 'picked' : ''} ${view.pickedToday ? 'blocked' : ''}`}
                onClick={() => session?.status === 'voting' && runAction(() => roomActions.vote(code, user.id, menu.id))}
              >
                {view.pickedToday ? <span className="today-badge">今日已中</span> : null}
                {view.myCount > 0 ? <span className="vote-badge">我累计 ×{view.myCount}</span> : null}
                <div className="dish-emoji">{menu.emoji}</div>
                <h3>{menu.name}</h3>
                <p>{menu.desc || menu.category}</p>
                <div
                  className={`weight-bar ${view.decayPct > 0 ? 'decayed' : ''}`}
                  title={view.pickedToday ? '今日已中，权重为 0' : `衰减进度 ${view.decayPct}%`}
                >
                  <span style={{ width: `${view.decayPct}%` }} />
                </div>
                <div className="meta">
                  <span>
                    权重 {view.weight}
                    {view.personalBoost
                      ? `（含我的 +${Number((view.personalBoost * view.recency).toFixed(2))}）`
                      : ''}
                  </span>
                  <span>
                    {view.pickedToday
                      ? '今日已中'
                      : view.decayPct === 0
                        ? '未衰减'
                        : `衰减 ${view.decayPct}%`}
                  </span>
                </div>
              </button>
            );
          })}
        </section>

        <section className="history">
          <h3>近期开出的菜</h3>
          {group.history.length === 0 ? (
            <p className="rules">还没抽过。抽中过的菜会在这里留下油渍。</p>
          ) : (
            <div className="timeline">
              {group.history.slice(0, 10).map((item) => {
                const audit = item.audit;
                const open = auditId === item.id;
                const chance = audit ? `${(audit.winnerChance * 100).toFixed(1)}%` : null;
                return (
                  <button
                    type="button"
                    className={`stamp ${open ? 'open' : ''}`}
                    key={item.id}
                    onClick={() => setAuditId(open ? null : item.id)}
                  >
                    <div className="when">{formatWhen(item.at)}</div>
                    <div style={{ fontSize: 22, margin: '6px 0' }}>{item.emoji}</div>
                    <b>{item.name}</b>
                    {item.forced ? <div className="stamp-tag">团长强抽</div> : null}
                    {audit ? (
                      <div className="stamp-audit-hint">
                        {open ? '收起明细' : `查看权重 · ${chance}`}
                      </div>
                    ) : null}
                    {open && audit ? (
                      <div className="stamp-audit" onClick={(e) => e.stopPropagation()}>
                        <div className="stamp-audit-meta">
                          总票 {audit.voteTotal} · 总权重 {audit.total} · 中奖权重 {audit.winnerWeight}
                          {audit.reconstructed ? ' · 无投票快照（按当时衰减重建）' : ''}
                        </div>
                        {[...audit.weights]
                          .sort((a, b) => b.weight - a.weight)
                          .map((row) => {
                            const pct = audit.total > 0 && row.weight > 0
                              ? `${((row.weight / audit.total) * 100).toFixed(1)}%`
                              : '—';
                            return (
                              <div
                                className={`stamp-audit-row ${row.menuId === item.menuId ? 'win' : ''}`}
                                key={row.menuId}
                              >
                                <span>
                                  {row.emoji} {row.name}
                                  {row.voteCount ? ` · 票×${row.voteCount}` : ''}
                                  {row.pickedToday ? ' · 当日已中' : ''}
                                </span>
                                <span>
                                  {row.weight} / {pct}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {kitchen && isLeader ? <Kitchen group={group} user={user} onClose={() => setKitchen(false)} /> : null}

      {showingWheel ? (
        <div className="overlay">
          <div className="wheel-card">
            <p className="kicker">Lazy susan</p>
            <h2 className="side-brand" style={{ fontSize: 40 }}>
              {session.status === 'failed' ? '今天菜单见底了' : '转起来'}
            </h2>
            {session.status === 'spinning' ? (
              <>
                <p className="subtitle">全员点过「参与随机」后，按当前权重出菜。</p>
                <div className="ready-pills">
                  {group.members.map((member) => (
                    <span
                      className={`pill ${session.ready.includes(member.userId) ? 'yes' : ''}`}
                      key={member.userId}
                    >
                      {member.name}
                      {session.ready.includes(member.userId) ? ' ✓' : ' …'}
                    </span>
                  ))}
                </div>
                <Wheel group={group} spinning={false} />
                <div className="actions" style={{ justifyContent: 'center' }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={myReady}
                    onClick={() => runAction(() => roomActions.ready(code, user.id))}
                  >
                    {myReady ? '已参与，等其他人' : '参与随机点餐'}
                  </button>
                  {isLeader ? (
                    <button className="btn btn-ghost" type="button" onClick={() => runAction(() => roomActions.forceDraw(code, user.id))}>
                      不等了，先开抽
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
            {session.status === 'revealing' ? (
              <>
                <p className="subtitle">权重已锁死，转盘正在找今晚的那道菜。</p>
                <Wheel group={group} spinning />
              </>
            ) : null}
            {session.status === 'completed' && session.result?.winner ? (
              <>
                <Wheel group={group} spinning={false} />
                <div className="result-hero">
                  {session.result.winner.emoji} {session.result.winner.name}
                </div>
                <p className="subtitle">
                  今晚就它了。这道菜今天不会再被抽中，随后几天权重也会偏低。
                  {session.result.audit
                    ? ` 开奖瞬间概率 ${(session.result.audit.winnerChance * 100).toFixed(1)}%（共 ${session.result.audit.voteTotal} 票）。`
                    : ''}
                </p>
                {isLeader ? (
                  <button className="btn btn-gold" type="button" onClick={() => runAction(() => roomActions.close(code, user.id))}>
                    收桌，回到菜单墙
                  </button>
                ) : (
                  <p className="rules">等团长收桌。</p>
                )}
              </>
            ) : null}
            {session.status === 'failed' ? (
              <>
                <p className="subtitle">同一天不会抽中两次。请团长补充菜单，或明天再来。</p>
                {isLeader ? (
                  <button className="btn btn-gold" type="button" onClick={() => runAction(() => roomActions.close(code, user.id))}>
                    知道了
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <Toasts items={toasts} />
    </div>
  );
}
