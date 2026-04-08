// ─────────────────────────────────────────────────────────────
// useDraggableOrder — shared drag-and-drop reorder primitive.
//
// Extracted from PresupuestoTab's category pills + HomeView's top-tab
// reorder logic. Gives any list of pill-style items:
//   • native HTML5 drag & drop with visual feedback (gold border glow,
//     scale 1.05 on drag-over, 0.4 opacity on the dragged item)
//   • persistent order: localStorage fast path + /api/preferences cloud
//     sync under a caller-supplied key
//   • stable rendering: new items added to the source array automatically
//     append at the end instead of vanishing.
//
// Usage:
//   const { orderedItems, dragHandlers, getDragVisuals } =
//     useDraggableOrder(SUB_VIEWS, 'ui_smart_money_sub_views');
//
//   {orderedItems.map(item => {
//     const { isDragging, isDragOver, extraStyle } = getDragVisuals(item.id);
//     return (
//       <button
//         {...dragHandlers(item.id)}
//         style={{
//           ...baseStyle(item),
//           ...extraStyle,
//           borderColor: isDragOver ? 'var(--gold)' : baseStyle(item).borderColor,
//           background:  isDragOver ? 'rgba(200,164,78,.25)' : baseStyle(item).background,
//         }}
//       >{item.label}</button>
//     );
//   })}
//
// Items must have a stable `id` field. Cloud sync uses the existing
// /api/preferences endpoint which stores JSON values keyed by a string.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback } from 'react';
import { API_URL } from '../constants/index.js';

export function useDraggableOrder(items, orderKey) {
  const [order, setOrder] = useState(() => {
    // Seed from localStorage synchronously so the first render shows
    // the saved order without a flash of the default.
    try {
      const cached = localStorage.getItem(orderKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return null;
  });
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Fetch cloud preference once on mount (and overwrite localStorage if newer)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/preferences/${encodeURIComponent(orderKey)}`);
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        const value = d?.value;
        if (Array.isArray(value)) {
          setOrder(value);
          try { localStorage.setItem(orderKey, JSON.stringify(value)); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [orderKey]);

  // Compute orderedItems: saved order first, then any newly-added items
  const orderedItems = useMemo(() => {
    if (!order || !Array.isArray(order) || order.length === 0) return items;
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    const seen = new Set();
    const out = [];
    for (const id of order) {
      if (byId[id] && !seen.has(id)) { out.push(byId[id]); seen.add(id); }
    }
    for (const i of items) {
      if (!seen.has(i.id)) out.push(i);
    }
    return out;
  }, [items, order]);

  // Persist new order to localStorage + cloud
  const persist = useCallback(async (newOrder) => {
    setOrder(newOrder);
    try { localStorage.setItem(orderKey, JSON.stringify(newOrder)); } catch {}
    try {
      await fetch(`${API_URL}/api/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: orderKey, value: newOrder }),
      });
    } catch {}
  }, [orderKey]);

  // Handlers spread directly onto the draggable element
  const dragHandlers = useCallback((id) => ({
    draggable: true,
    onDragStart: (e) => {
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(id));
      } catch {}
      setDragId(id);
    },
    onDragOver: (e) => {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch {}
      if (dragOverId !== id) setDragOverId(id);
    },
    onDragLeave: () => {
      if (dragOverId === id) setDragOverId(null);
    },
    onDrop: (e) => {
      e.preventDefault();
      let fromId;
      try { fromId = e.dataTransfer.getData('text/plain'); } catch {}
      if (!fromId) fromId = dragId;
      setDragId(null);
      setDragOverId(null);
      if (!fromId || String(fromId) === String(id)) return;
      const currentIds = orderedItems.map(i => String(i.id));
      const fromIdx = currentIds.indexOf(String(fromId));
      const toIdx = currentIds.indexOf(String(id));
      if (fromIdx < 0 || toIdx < 0) return;
      const newOrder = [...currentIds];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, String(fromId));
      persist(newOrder);
    },
    onDragEnd: () => {
      setDragId(null);
      setDragOverId(null);
    },
  }), [dragId, dragOverId, orderedItems, persist]);

  // Visual state + style fragment to merge into the element's style prop
  const getDragVisuals = useCallback((id) => {
    const isDragging = dragId === id;
    const isDragOver = dragOverId === id && dragId && dragId !== id;
    return {
      isDragging,
      isDragOver,
      extraStyle: {
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: isDragOver ? 'scale(1.05)' : 'none',
        transition: 'transform .12s ease, opacity .12s ease, background .12s ease, border-color .12s ease',
        userSelect: 'none',
      },
    };
  }, [dragId, dragOverId]);

  return { orderedItems, dragHandlers, getDragVisuals };
}

export default useDraggableOrder;
