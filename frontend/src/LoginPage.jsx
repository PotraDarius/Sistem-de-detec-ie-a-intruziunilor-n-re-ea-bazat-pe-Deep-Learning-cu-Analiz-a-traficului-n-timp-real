import React, { useState } from 'react';
import { Shield, Lock, User, Mail, AlertTriangle, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from './AuthContext';
import ThemeToggle from './ThemeToggle';

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN / REGISTER PAGE — același stil grafic ca dashboard-ul
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [username,   setUsername]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState(null);
  const [busy,       setBusy]       = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(identifier.trim(), password);
      } else {
        await register(username.trim(), email.trim(), password);
      }
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-50 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 font-sans relative overflow-hidden flex items-center justify-center p-4">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-sans { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .grid-bg {
          background-image:
            linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
            linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>

      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(34,211,238,0.05), transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(244,63,94,0.04), transparent 50%)' }} />

      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header brand */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
            <Shield className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-base tracking-[0.18em] uppercase text-zinc-900 dark:text-zinc-100 font-medium">
                NIDS <span className="text-cyan-500 dark:text-cyan-400">/</span> Sentinel
              </h1>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400/80 border border-cyan-500/30 rounded-sm px-1.5 py-0.5">
                1D-CNN Engine
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-zinc-500 tracking-wide">
              Authentication Required · Operator Access
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/70 backdrop-blur-sm overflow-hidden">
          <div className="flex border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-zinc-950/40">
            <TabButton active={mode === 'login'}    onClick={() => { setMode('login');    setError(null); }}>Sign In</TabButton>
            <TabButton active={mode === 'register'} onClick={() => { setMode('register'); setError(null); }}>Register</TabButton>
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-4">
            {mode === 'login' ? (
              <Field icon={User} label="Username sau Email" value={identifier}
                     onChange={setIdentifier} autoComplete="username" required />
            ) : (
              <>
                <Field icon={User}  label="Username" value={username}
                       onChange={setUsername} autoComplete="username" required />
                <Field icon={Mail}  label="Email"    value={email}    type="email"
                       onChange={setEmail} autoComplete="email" required />
              </>
            )}
            <Field icon={Lock} label="Parolă" value={password} type="password"
                   onChange={setPassword}
                   autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />

            {error && (
              <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 font-mono text-[11px] text-rose-600 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[12px] uppercase tracking-wider font-semibold transition-all border bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            >
              {busy ? 'Procesare…' : (mode === 'login' ? 'Authenticate' : 'Create Account')}
              {!busy && <ChevronRight className="h-3.5 w-3.5" />}
            </button>

            <div className="text-center font-mono text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider pt-1">
              {mode === 'login' ? (
                <>nu ai cont? <button type="button" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300" onClick={() => { setMode('register'); setError(null); }}>înregistrează-te</button></>
              ) : (
                <>ai deja cont? <button type="button" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300" onClick={() => { setMode('login'); setError(null); }}>autentifică-te</button></>
              )}
            </div>
          </form>
        </div>

        <div className="mt-4 text-center font-mono text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">
          nids · 1d-cnn
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors ${
        active
          ? 'text-cyan-700 dark:text-cyan-300 border-b-2 border-cyan-500 bg-cyan-500/5'
          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 border-b-2 border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function Field({ icon: Icon, label, value, onChange, type = 'text', autoComplete, required }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword && show ? 'text' : type;

  return (
    <label className="block">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="relative">
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          className={`w-full bg-white border-zinc-300 text-zinc-900 dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100 border text-sm rounded px-3 py-2 outline-none transition-colors hover:border-cyan-500/60 focus:border-cyan-500 font-mono ${isPassword ? 'pr-10' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors p-1"
            title={show ? 'Ascunde parola' : 'Arată parola'}
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </label>
  );
}
function translateError(code) {
  const map = {
    invalid_credentials:      'Username/email sau parolă incorectă.',
    username_taken:           'Username-ul este deja folosit.',
    email_taken:              'Email-ul este deja folosit.',
    missing_credentials:      'Completează toate câmpurile.',
    login_failed:             'Autentificare eșuată.',
    register_failed:          'Înregistrare eșuată.',
  };
  return map[code] || code;
}
