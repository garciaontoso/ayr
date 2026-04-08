import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_URL } from '../../constants';
import { Modal } from '../ui';

const TYPE_ICONS = { book: '📘', paper: '📄', podcast: '🎙️', article: '🔗' };
const TYPE_LABELS = { book: 'Libro', paper: 'Paper', podcast: 'Podcast', article: 'Artículo' };
const TYPE_PLURAL = { book: 'libros', paper: 'papers', podcast: 'podcasts', article: 'artículos' };
const STATUS_LABELS = { queue: 'En cola', reading: 'Leyendo', read: 'Leído', abandoned: 'Abandonado' };
const STATUS_CYCLE = { queue: 'reading', reading: 'read', read: 'queue', abandoned: 'queue' };

const TIER_COLORS = {
  S: 'var(--gold)',
  A: 'var(--green)',
  B: 'var(--text-tertiary)',
};

const STATUS_COLORS = {
  queue: 'var(--text-tertiary)',
  reading: 'var(--gold)',
  read: 'var(--green)',
  abandoned: 'var(--red)',
};

export default function LibraryTab() {
  // --- State (ALL useState BEFORE any useEffect/useCallback — TDZ) ---
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTier, setFilterTier] = useState('all');

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    author: '',
    year: '',
    type: 'book',
    tier: 'A',
    status: 'queue',
    source_url: '',
  });
  const [saving, setSaving] = useState(false);

  // Notes modal
  const [notesItem, setNotesItem] = useState(null);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [newNoteTickers, setNewNoteTickers] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // --- Loaders ---
  const loadItems = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/api/library`);
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotes = useCallback(async (itemId) => {
    setNotesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/library/${itemId}/notes`);
      const json = await res.json();
      setNotes(Array.isArray(json.notes) ? json.notes : []);
    } catch (e) {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  // --- Effects ---
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (notesItem) loadNotes(notesItem.id);
  }, [notesItem, loadNotes]);

  // --- Mutations ---
  const updateItem = async (id, patch) => {
    // Optimistic
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    try {
      await fetch(`${API_URL}/api/library/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      loadItems();
    }
  };

  const deleteItem = async (id) => {
    if (!confirm('¿Borrar este item?')) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await fetch(`${API_URL}/api/library/${id}`, { method: 'DELETE' });
    } catch (e) {
      loadItems();
    }
  };

  const createItem = async () => {
    if (!newItem.title.trim()) {
      alert('El título es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const body = { ...newItem };
      if (body.year) body.year = Number(body.year);
      else delete body.year;
      const res = await fetch(`${API_URL}/api/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Error al crear');
      setShowAdd(false);
      setNewItem({
        title: '',
        author: '',
        year: '',
        type: 'book',
        tier: 'A',
        status: 'queue',
        source_url: '',
      });
      loadItems();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !notesItem) return;
    setAddingNote(true);
    try {
      const tickers = newNoteTickers
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      await fetch(`${API_URL}/api/library/${notesItem.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_text: newNote, related_tickers: tickers }),
      });
      setNewNote('');
      setNewNoteTickers('');
      loadNotes(notesItem.id);
    } catch (e) {
      alert(String(e));
    } finally {
      setAddingNote(false);
    }
  };

  const cycleStatus = (item) => {
    const next = STATUS_CYCLE[item.status] || 'queue';
    const patch = { status: next };
    if (next === 'reading' && !item.started_at) {
      patch.started_at = new Date().toISOString().slice(0, 10);
    }
    if (next === 'read' && !item.finished_at) {
      patch.finished_at = new Date().toISOString().slice(0, 10);
    }
    updateItem(item.id, patch);
  };

  const setRating = (item, rating) => {
    // Click same rating clears it
    const newR = item.rating === rating ? 0 : rating;
    updateItem(item.id, { rating: newR });
  };

  // --- Derived ---
  const stats = useMemo(() => {
    const byType = { book: 0, paper: 0, podcast: 0, article: 0 };
    const byStatus = { queue: 0, reading: 0, read: 0, abandoned: 0 };
    items.forEach((it) => {
      if (byType[it.type] !== undefined) byType[it.type]++;
      if (byStatus[it.status] !== undefined) byStatus[it.status]++;
    });
    return { byType, byStatus };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterType !== 'all' && it.type !== filterType) return false;
      if (filterStatus !== 'all' && it.status !== filterStatus) return false;
      if (filterTier !== 'all' && it.tier !== filterTier) return false;
      return true;
    });
  }, [items, filterType, filterStatus, filterTier]);

  // --- Styles ---
  const chipStyle = (active) => ({
    padding: '6px 12px',
    borderRadius: 14,
    border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--subtle-bg)' : 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  });

  const thStyle = {
    textAlign: 'left',
    padding: '10px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)',
  };

  const tdStyle = {
    padding: '10px 8px',
    fontSize: 13,
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border)',
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--subtle-bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: 600,
  };

  // --- Render ---
  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 6,
            }}
          >
            Library
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {stats.byType.book} libros · {stats.byType.paper} papers ·{' '}
            {stats.byType.podcast} podcasts · {stats.byType.article} articles
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {stats.byStatus.queue} en cola · {stats.byStatus.reading} leyendo ·{' '}
            {stats.byStatus.read} leídos
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            padding: '8px 16px',
            background: 'var(--gold)',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Añadir
        </button>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              alignSelf: 'center',
              marginRight: 4,
              minWidth: 48,
            }}
          >
            TIPO:
          </span>
          <button style={chipStyle(filterType === 'all')} onClick={() => setFilterType('all')}>
            Todos
          </button>
          <button style={chipStyle(filterType === 'book')} onClick={() => setFilterType('book')}>
            📘 Libros
          </button>
          <button style={chipStyle(filterType === 'paper')} onClick={() => setFilterType('paper')}>
            📄 Papers
          </button>
          <button
            style={chipStyle(filterType === 'podcast')}
            onClick={() => setFilterType('podcast')}
          >
            🎙️ Podcasts
          </button>
          <button
            style={chipStyle(filterType === 'article')}
            onClick={() => setFilterType('article')}
          >
            🔗 Artículos
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              alignSelf: 'center',
              marginRight: 4,
              minWidth: 48,
            }}
          >
            STATUS:
          </span>
          <button
            style={chipStyle(filterStatus === 'all')}
            onClick={() => setFilterStatus('all')}
          >
            Todos
          </button>
          <button
            style={chipStyle(filterStatus === 'queue')}
            onClick={() => setFilterStatus('queue')}
          >
            En cola
          </button>
          <button
            style={chipStyle(filterStatus === 'reading')}
            onClick={() => setFilterStatus('reading')}
          >
            Leyendo
          </button>
          <button
            style={chipStyle(filterStatus === 'read')}
            onClick={() => setFilterStatus('read')}
          >
            Leídos
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              alignSelf: 'center',
              marginRight: 4,
              minWidth: 48,
            }}
          >
            TIER:
          </span>
          <button style={chipStyle(filterTier === 'all')} onClick={() => setFilterTier('all')}>
            Todos
          </button>
          <button style={chipStyle(filterTier === 'S')} onClick={() => setFilterTier('S')}>
            S
          </button>
          <button style={chipStyle(filterTier === 'A')} onClick={() => setFilterTier('A')}>
            A
          </button>
          <button style={chipStyle(filterTier === 'B')} onClick={() => setFilterTier('B')}>
            B
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          Cargando...
        </div>
      ) : err ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Error: {err}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          No hay items con estos filtros.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Título</th>
                <th style={{ ...thStyle, width: 70 }}>Tipo</th>
                <th style={{ ...thStyle, width: 60 }}>Tier</th>
                <th style={{ ...thStyle, width: 110 }}>Status</th>
                <th style={{ ...thStyle, width: 120 }}>Rating</th>
                <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {it.source_url ? (
                        <a
                          href={it.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          {it.title}
                        </a>
                      ) : (
                        it.title
                      )}
                    </div>
                    {(it.author || it.year) && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {it.author}
                        {it.author && it.year ? ' · ' : ''}
                        {it.year || ''}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle} title={TYPE_LABELS[it.type] || it.type}>
                    <span style={{ fontSize: 16 }}>{TYPE_ICONS[it.type] || '📄'}</span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-block',
                        minWidth: 22,
                        padding: '2px 6px',
                        borderRadius: 4,
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: TIER_COLORS[it.tier] || 'var(--text-tertiary)',
                        border: `1px solid ${TIER_COLORS[it.tier] || 'var(--border)'}`,
                      }}
                    >
                      {it.tier || '—'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      onClick={() => cycleStatus(it)}
                      style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--subtle-bg)',
                        color: STATUS_COLORS[it.status] || 'var(--text-tertiary)',
                        border: `1px solid ${
                          STATUS_COLORS[it.status] || 'var(--border)'
                        }`,
                        cursor: 'pointer',
                      }}
                      title="Click para cambiar"
                    >
                      {STATUS_LABELS[it.status] || it.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        onClick={() => setRating(it, n)}
                        style={{
                          cursor: 'pointer',
                          fontSize: 14,
                          color: n <= (it.rating || 0) ? 'var(--gold)' : 'var(--text-tertiary)',
                          marginRight: 1,
                          userSelect: 'none',
                        }}
                      >
                        ★
                      </span>
                    ))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      onClick={() => setNotesItem(it)}
                      title="Ver notas"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 13,
                        marginRight: 4,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      📝
                    </button>
                    <button
                      onClick={() => deleteItem(it.id)}
                      title="Borrar"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: 'var(--red)',
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Añadir a Library"
        width={480}
        footer={
          <>
            <button
              onClick={() => setShowAdd(false)}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={createItem}
              disabled={saving}
              style={{
                padding: '8px 16px',
                background: 'var(--gold)',
                border: 'none',
                borderRadius: 6,
                color: '#000',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        }
      >
        <>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Título *</label>
              <input
                style={inputStyle}
                value={newItem.title}
                onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                placeholder="The Intelligent Investor"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Autor</label>
                <input
                  style={inputStyle}
                  value={newItem.author}
                  onChange={(e) => setNewItem({ ...newItem, author: e.target.value })}
                  placeholder="Benjamin Graham"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Año</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={newItem.year}
                  onChange={(e) => setNewItem({ ...newItem, year: e.target.value })}
                  placeholder="1949"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Tipo</label>
                <select
                  style={inputStyle}
                  value={newItem.type}
                  onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                >
                  <option value="book">📘 Libro</option>
                  <option value="paper">📄 Paper</option>
                  <option value="podcast">🎙️ Podcast</option>
                  <option value="article">🔗 Artículo</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Tier</label>
                <select
                  style={inputStyle}
                  value={newItem.tier}
                  onChange={(e) => setNewItem({ ...newItem, tier: e.target.value })}
                >
                  <option value="S">S</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Status</label>
                <select
                  style={inputStyle}
                  value={newItem.status}
                  onChange={(e) => setNewItem({ ...newItem, status: e.target.value })}
                >
                  <option value="queue">En cola</option>
                  <option value="reading">Leyendo</option>
                  <option value="read">Leído</option>
                  <option value="abandoned">Abandonado</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 4 }}>
              <label style={labelStyle}>URL (opcional)</label>
              <input
                style={inputStyle}
                value={newItem.source_url}
                onChange={(e) => setNewItem({ ...newItem, source_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
        </>
      </Modal>

      {/* Notes Modal */}
      <Modal
        open={!!notesItem}
        onClose={() => setNotesItem(null)}
        width={600}
        title={
          notesItem ? (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>
                Notas
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {notesItem.title}
              </div>
              {notesItem.author && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {notesItem.author}
                </div>
              )}
            </div>
          ) : null
        }
      >
        {notesItem && (
          <>
            <div style={{ marginBottom: 16 }}>
              {notesLoading ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando...</div>
              ) : notes.length === 0 ? (
                <div
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 13,
                    padding: 16,
                    textAlign: 'center',
                    border: '1px dashed var(--border)',
                    borderRadius: 6,
                  }}
                >
                  Sin notas todavía.
                </div>
              ) : (
                notes.map((n) => {
                  let tickers = [];
                  try {
                    tickers = n.related_tickers_json ? JSON.parse(n.related_tickers_json) : [];
                  } catch {}
                  return (
                    <div
                      key={n.id}
                      style={{
                        padding: 10,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        marginBottom: 8,
                        background: 'var(--subtle-bg)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          whiteSpace: 'pre-wrap',
                          marginBottom: 6,
                        }}
                      >
                        {n.note_text}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {tickers.map((t) => (
                            <span
                              key={t}
                              style={{
                                fontSize: 10,
                                padding: '2px 6px',
                                borderRadius: 3,
                                background: 'var(--border)',
                                color: 'var(--gold)',
                                fontFamily: 'var(--fm)',
                                fontWeight: 600,
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
              }}
            >
              <label style={labelStyle}>Nueva nota</label>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
                placeholder="Escribe tu nota..."
              />
              <label style={labelStyle}>Tickers relacionados (separados por coma)</label>
              <input
                style={{ ...inputStyle, marginBottom: 10 }}
                value={newNoteTickers}
                onChange={(e) => setNewNoteTickers(e.target.value)}
                placeholder="AAPL, MSFT, KO"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={addNote}
                  disabled={addingNote || !newNote.trim()}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--gold)',
                    border: 'none',
                    borderRadius: 6,
                    color: '#000',
                    cursor: addingNote || !newNote.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    opacity: addingNote || !newNote.trim() ? 0.5 : 1,
                  }}
                >
                  {addingNote ? 'Añadiendo...' : 'Añadir nota'}
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
