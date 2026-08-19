import { useEffect, useMemo, useState } from 'react';

export default function Wheel({ group, spinning }) {
  const menus = group.menus;
  const winnerId = group.session?.result?.winnerId;
  const [rotate, setRotate] = useState(0);
  const slice = 360 / Math.max(menus.length, 1);
  const winnerIndex = Math.max(0, menus.findIndex((m) => m.id === winnerId));
  const radius = 150;

  useEffect(() => {
    if (!winnerId) return undefined;
    const landing = 360 - winnerIndex * slice - slice / 2;
    if (!spinning) {
      setRotate((prev) => (prev === 0 ? landing : prev));
      return undefined;
    }
    setRotate(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRotate(360 * 7 + landing));
    });
    return () => cancelAnimationFrame(id);
  }, [spinning, winnerId, winnerIndex, slice]);

  const labels = useMemo(
    () =>
      menus.map((menu, index) => ({
        menu,
        angle: index * slice + slice / 2,
      })),
    [menus, slice],
  );

  return (
    <div className="lazy-susan">
      <div className="pointer" />
      <div className="susan" style={{ transform: `rotate(${rotate}deg)` }}>
        {labels.map(({ menu, angle }) => (
          <div
            key={menu.id}
            className="wedge-label"
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px)`,
            }}
          >
            <div>{menu.emoji}</div>
            <div>{menu.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
