import { useEffect, useRef, useState } from 'react';

const LIVE_MS = 10000;
const HISTORY_LIMIT = 40;

function formatWhen(at) {
  if (!at) return '';
  return new Date(at).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Toasts({ items }) {
  const [liveIds, setLiveIds] = useState([]);
  const [open, setOpen] = useState(false);
  const seenRef = useRef(new Set());
  const timersRef = useRef(new Map());

  const history = (items || []).slice(-HISTORY_LIMIT).reverse();

  useEffect(() => {
    for (const item of items || []) {
      if (!item?.id || seenRef.current.has(item.id)) continue;
      seenRef.current.add(item.id);
      setLiveIds((prev) => [...prev.filter((id) => id !== item.id), item.id].slice(-4));

      const existing = timersRef.current.get(item.id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setLiveIds((prev) => prev.filter((id) => id !== item.id));
        timersRef.current.delete(item.id);
      }, LIVE_MS);
      timersRef.current.set(item.id, timer);
    }
  }, [items]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const liveItems = (items || []).filter((item) => liveIds.includes(item.id));
  const unreadHint = history.length > 0;

  return (
    <div className="toast-dock">
      {liveItems.length ? (
        <div className="toasts">
          {liveItems.map((item) => (
            <div className="toast" key={item.id}>
              <button
                type="button"
                className="toast-dismiss"
                aria-label="关闭"
                onClick={() => setLiveIds((prev) => prev.filter((id) => id !== item.id))}
              >
                ×
              </button>
              <b>{item.title}</b>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="toast-history">
          <div className="toast-history-head">
            <b>消息记录</b>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              收起
            </button>
          </div>
          {history.length === 0 ? (
            <p className="toast-history-empty">还没有消息</p>
          ) : (
            <div className="toast-history-list">
              {history.map((item) => (
                <div className="toast-history-item" key={item.id}>
                  <div className="toast-history-meta">{formatWhen(item.at)}</div>
                  <b>{item.title}</b>
                  <span>{item.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <button
        type="button"
        className={`toast-bubble ${open ? 'open' : ''} ${unreadHint ? 'has-msg' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="消息记录"
        aria-label="消息记录"
      >
        <span className="toast-bubble-icon">💬</span>
        {history.length ? <span className="toast-bubble-count">{Math.min(history.length, 99)}</span> : null}
      </button>
    </div>
  );
}
