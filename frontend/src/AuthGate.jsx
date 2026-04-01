import { useState, useEffect } from 'react'

const PASSWORD_HASH = '747e0969a52839be30045bd72719fbb87d0f35ebc960a13811a1a7dbb6af5b26'
const SSO_SECRET = 'ontoso-sso-2026-rgo'
const SESSION_KEY = 'ayr_auth'
const SESSION_TIMEOUT = 15 * 60 * 1000 // 15 min

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function checkSSO() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('sso')
  if (!token) return false
  const w = Math.floor(Date.now() / (15 * 60 * 1000))
  const current = await sha256(`${SSO_SECRET}:${w}`)
  const prev = await sha256(`${SSO_SECRET}:${w - 1}`)
  if (token === current || token === prev) {
    // Clean URL
    params.delete('sso')
    const clean = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (clean ? '?' + clean : ''))
    return true
  }
  return false
}

function isSessionValid() {
  const ts = localStorage.getItem(SESSION_KEY)
  if (!ts) return false
  return Date.now() - Number(ts) < SESSION_TIMEOUT
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, Date.now().toString())
}

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      // 1. Check SSO token from OntoSo
      if (await checkSSO()) { saveSession(); setAuthed(true); setChecking(false); return }
      // 2. Check existing session
      if (isSessionValid()) { setAuthed(true); setChecking(false); return }
      setChecking(false)
    })()
  }, [])

  // Keep session alive while using the app
  useEffect(() => {
    if (!authed) return
    const interval = setInterval(() => saveSession(), 60000)
    return () => clearInterval(interval)
  }, [authed])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password.trim()) return
    const hash = await sha256(password)
    if (hash === PASSWORD_HASH) {
      saveSession()
      setAuthed(true)
      setError('')
    } else {
      setError('Password incorrecto')
      setPassword('')
    }
  }

  if (checking) return null
  if (authed) return children

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        {/* Animated logo ring */}
        <div style={styles.logoWrap}>
          <svg width="64" height="64" viewBox="0 0 40 40" style={{animation:'logoFloat 3s ease-in-out infinite'}}>
            <defs>
              <linearGradient id="authGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#d69e2e"/><stop offset="100%" stopColor="#946b1a"/>
              </linearGradient>
            </defs>
            <rect width="40" height="40" rx="9" fill="#0d1117"/>
            <rect x="1.5" y="1.5" width="37" height="37" rx="8" fill="none" stroke="url(#authGrad)" strokeWidth="1.8" opacity=".55"/>
            <text x="20" y="26.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="url(#authGrad)" fontFamily="system-ui">A&R</text>
          </svg>
        </div>
        <div style={styles.title}>A&R</div>
        <div style={styles.sub}>Análisis & Research</div>
        <div style={styles.divider}/>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={styles.input}
            onFocus={e => { e.target.style.borderColor = 'rgba(200,164,78,.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(200,164,78,.08)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--subtle-bg2)'; e.target.style.boxShadow = 'none'; }}
          />
          <button type="submit" style={styles.btn}
            onMouseEnter={e => e.target.style.background = '#d4a94e'}
            onMouseLeave={e => e.target.style.background = '#c8a44e'}>
            ENTRAR
          </button>
        </form>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.footer}>Dividend Equity Analysis</div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'radial-gradient(ellipse at 50% 30%, rgba(200,164,78,.04) 0%, #000000 70%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'IBM Plex Mono', 'DM Sans', -apple-system, monospace",
  },
  box: {
    textAlign: 'center', padding: '48px 44px',
    background: 'rgba(22,22,22,.8)', backdropFilter: 'blur(20px)',
    border: '1px solid var(--subtle-bg2)', borderRadius: '24px',
    minWidth: '340px', animation: 'fadeUp .6s cubic-bezier(.16,1,.3,1)',
  },
  logoWrap: {
    marginBottom: '16px',
    animation: 'glowPulse 3s ease-in-out infinite',
    borderRadius: '16px', display: 'inline-block',
  },
  title: {
    fontSize: '28px', fontWeight: 800, color: '#c8a44e',
    letterSpacing: '6px', marginBottom: '2px',
    fontFamily: "'Playfair Display', Georgia, serif",
  },
  sub: {
    fontSize: '10px', color: '#86868b', letterSpacing: '3px',
    textTransform: 'uppercase', marginBottom: '0',
  },
  divider: {
    width: '40px', height: '1px', margin: '20px auto',
    background: 'linear-gradient(90deg, transparent, rgba(200,164,78,.3), transparent)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: {
    background: 'var(--subtle-bg)', border: '1px solid var(--subtle-bg2)', borderRadius: '12px',
    padding: '14px 16px', color: '#f5f5f7', fontSize: '14px',
    fontFamily: 'inherit', outline: 'none', textAlign: 'center',
    letterSpacing: '3px', transition: 'all .2s ease',
  },
  btn: {
    background: '#c8a44e', color: '#000', border: 'none', borderRadius: '12px',
    padding: '12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
    letterSpacing: '2px', fontFamily: 'inherit', transition: 'all .15s ease',
  },
  error: { color: '#ff453a', fontSize: '11px', marginTop: '8px', animation: 'fadeIn .3s ease' },
  footer: {
    fontSize: '8px', color: '#48484a', letterSpacing: '1.5px',
    textTransform: 'uppercase', marginTop: '24px',
  },
}
