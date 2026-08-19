export default function Toasts({ items }) {
  if (!items?.length) return null;
  return (
    <div className="toasts">
      {items.slice(-4).map((item) => (
        <div className="toast" key={item.id}>
          <b>{item.title}</b>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
