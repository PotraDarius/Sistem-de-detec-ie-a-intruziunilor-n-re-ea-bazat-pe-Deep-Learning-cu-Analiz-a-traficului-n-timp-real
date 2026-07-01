import React, { useState } from 'react';
import { Shield, User, Mail, Lock, AlertTriangle, ArrowLeft, Trash2, Save, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from './AuthContext';
import ThemeToggle from './ThemeToggle';

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT PAGE — update username/email/parolă + ștergere cont
// ─────────────────────────────────────────────────────────────────────────────
export default function AccountPage({ onBack }) {
  const { user, updateAccount, deleteAccount } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [email,    setEmail]    = useState(user?.email    || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy,    setBusy]    = useState(false);

  const onSave = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null); setBusy(true);

    const payload = { current_password: currentPassword };
    if (username !== user.username) payload.username = username.trim();
    if (email    !== user.email)    payload.email    = email.trim();
    if (newPassword)                payload.new_password = newPassword;

    if (Object.keys(payload).length === 1) {
      setError('Nu ai modificat nimic.');
      setBusy(false);
      return;
    }

    try {
      await updateAccount(payload);
      setSuccess('Cont actualizat cu succes.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setError(null); setBusy(true);
    try {
      await deleteAccount(deletePassword);
    } catch (err) {
      setError(translateError(err.message));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-50 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 font-sans relative overflow-hidden">
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

      <div className="relative z-10 max-w-2xl mx-auto p-4 lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
              <Shield className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="font-mono text-base tracking-[0.18em] uppercase text-zinc-900 dark:text-zinc-100 font-medium">
                Account <span className="text-cyan-500 dark:text-cyan-400">/</span> Settings
              </h1>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-500 tracking-wide">
                Operator profile · {user?.username}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-semibold transition-all border bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 font-mono"
            >
              <ArrowLeft className="h-3 w-3" />
              Înapoi la Dashboard
            </button>
          </div>
        </div>

        {/* Card: update */}
        <div className="rounded border border-zinc-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-950/70 backdrop-blur-sm overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-zinc-950/40">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-700 dark:text-zinc-300">
              Profil <span className="text-zinc-400 dark:text-zinc-600">update credentials</span>
            </h3>
          </div>

          <form onSubmit={onSave} className="p-5 space-y-4">
            <Field icon={User} label="Username" value={username} onChange={setUsername} required />
            <Field icon={Mail} label="Email"    value={email}    type="email" onChange={setEmail} required />

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-3">
                schimbare parolă
              </div>
              <Field icon={Lock} label="Parolă nouă" value={newPassword}
                     type="password" onChange={setNewPassword} autoComplete="new-password" />
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
              <Field icon={Lock} label="Parolă curentă"
                     value={currentPassword} type="password" onChange={setCurrentPassword}
                     autoComplete="current-password" required />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 font-mono text-[11px] text-rose-600 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 rounded border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 font-mono text-[11px] text-emerald-600 dark:text-emerald-300">
                <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[12px] uppercase tracking-wider font-semibold transition-all border bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            >
              <Save className="h-3.5 w-3.5" />
              {busy ? 'Salvează…' : 'Salvează modificările'}
            </button>
          </form>
        </div>

        {/* Card: delete */}
        <div className="rounded border border-rose-500/30 bg-rose-50 dark:bg-rose-950/10 backdrop-blur-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-rose-500/20 bg-rose-100/60 dark:bg-rose-950/20">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-rose-600 dark:text-rose-300">
              Danger Zone <span className="text-rose-500/60">permanent</span>
            </h3>
          </div>

          <div className="p-5 space-y-3">
            <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Ștergerea contului este permanentă și nu poate fi anulată. Toate datele
              asociate (excluzând log-urile de captură) vor fi eliminate definitiv.
            </p>

            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(true); setError(null); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-semibold transition-all border bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20 font-mono"
              >
                <Trash2 className="h-3 w-3" />
                Șterge contul
              </button>
            ) : (
              <div className="space-y-3">
                <Field icon={Lock} label="Confirmă cu parola curentă"
                       value={deletePassword} type="password" onChange={setDeletePassword}
                       autoComplete="current-password" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={busy || !deletePassword}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-semibold transition-all border bg-rose-500/20 text-rose-700 dark:text-rose-200 border-rose-500/50 hover:bg-rose-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                  >
                    <Trash2 className="h-3 w-3" />
                    {busy ? 'Ștergere…' : 'Confirmă ștergerea'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setError(null); }}
                    className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wider font-semibold transition-all border bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-800 font-mono"
                  >
                    Anulează
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
    invalid_current_password: 'Parola curentă este incorectă.',
    invalid_password:         'Parola este incorectă.',
    username_taken:           'Username-ul este deja folosit.',
    email_taken:              'Email-ul este deja folosit.',
    update_failed:            'Actualizare eșuată.',
    delete_failed:            'Ștergere eșuată.',
    unauthorized:             'Sesiune expirată. Te rugăm să te autentifici din nou.',
  };
  return map[code] || code;
}
