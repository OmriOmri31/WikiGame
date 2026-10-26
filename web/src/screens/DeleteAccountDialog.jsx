import { useEffect, useState } from 'react';
import { authErrorMessage } from '../account';
import { CONTACT_EMAIL } from '../legal';
import {
  deleteAccount,
  needsRecentLogin,
  reauthWithGoogle,
  reauthWithPassword,
  signInMethod,
} from '../deleteAccount';

const POPUP_CLOSED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

function deletionMessage(error) {
  const code = error?.cause?.code || '';
  if (error?.stage === 'data') {
    if (code === 'permission-denied') {
      return CONTACT_EMAIL
        ? `אי אפשר למחוק את הנתונים כרגע, ולכן גם החשבון לא נמחק. אפשר לכתוב לנו לכתובת ${CONTACT_EMAIL} ונמחק אותם ידנית.`
        : 'אי אפשר למחוק את הנתונים כרגע, ולכן גם החשבון לא נמחק. נסו שוב מאוחר יותר.';
    }
    return 'לא הצלחנו למחוק את הנתונים, ולכן החשבון לא נמחק. נסו שוב.';
  }
  return 'הנתונים נמחקו, אבל מחיקת החשבון עצמו נכשלה. נסו שוב.';
}

export default function DeleteAccountDialog({ user, onClose }) {
  const method = signInMethod(user);
  const [step, setStep] = useState('confirm');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, []);

  async function runDeletion() {
    setBusy(true);
    setError('');
    setStep('working');
    try {
      await deleteAccount(user);
      // Signing out happens with the deletion; the app returns to the guest home page.
    } catch (deletionError) {
      console.error(deletionError);
      setBusy(false);
      if (deletionError?.stage === 'reauth') {
        setStep('reauth');
        return;
      }
      setStep('confirm');
      setError(deletionMessage(deletionError));
    }
  }

  async function start() {
    setError('');
    if (await needsRecentLogin(user)) {
      setStep('reauth');
      return;
    }
    await runDeletion();
  }

  async function confirmPassword(event) {
    event.preventDefault();
    if (!password) {
      setError('יש להזין סיסמה.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reauthWithPassword(user, password);
    } catch (reauthError) {
      console.error(reauthError);
      setBusy(false);
      setError(authErrorMessage(reauthError, 'האימות נכשל. נסו שוב.'));
      return;
    }
    await runDeletion();
  }

  async function confirmGoogle() {
    setBusy(true);
    setError('');
    try {
      await reauthWithGoogle(user);
    } catch (reauthError) {
      setBusy(false);
      if (POPUP_CLOSED.has(reauthError?.code)) return;
      console.error(reauthError);
      setError(reauthError?.code === 'auth/user-mismatch'
        ? 'זה לא חשבון Google שמחובר לחשבון הזה.'
        : authErrorMessage(reauthError, 'האימות נכשל. נסו שוב.'));
      return;
    }
    await runDeletion();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <div
        className="modal-card confirm-card delete-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-body"
        onClick={(event) => event.stopPropagation()}
      >
        {step === 'reauth' ? (
          <>
            <h2 id="delete-title">רק לוודא שזה אתם</h2>
            <p id="delete-body" className="lede">
              {method.password
                ? 'לפני המחיקה צריך להזין שוב את הסיסמה של החשבון.'
                : 'לפני המחיקה צריך להתחבר שוב עם Google.'}
            </p>
            {method.password ? (
              <form onSubmit={confirmPassword} noValidate>
                <label htmlFor="delete-password">סיסמה</label>
                <input
                  id="delete-password"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={busy}
                  autoFocus
                />
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                <button className="secondary danger" type="submit" disabled={busy}>
                  {busy ? 'מוחקים…' : 'אימות ומחיקה'}
                </button>
              </form>
            ) : null}
            {method.google ? (
              <>
                {!method.password && error ? <p className="form-error" role="alert">{error}</p> : null}
                <button
                  className={method.password ? 'text-button' : 'secondary danger'}
                  type="button"
                  onClick={confirmGoogle}
                  disabled={busy}
                  autoFocus={!method.password}
                >
                  {method.password ? 'אימות עם Google במקום' : (busy ? 'מוחקים…' : 'אימות עם Google ומחיקה')}
                </button>
              </>
            ) : null}
            <button className="primary" type="button" onClick={onClose} disabled={busy}>
              ביטול
            </button>
          </>
        ) : (
          <>
            <h2 id="delete-title">למחוק את החשבון?</h2>
            <p id="delete-body" className="lede">
              הכינוי, כל התוצאות שלך והחשבון עצמו יימחקו, וגם המשחקים השמורים במכשיר הזה.
              אי אפשר לבטל את זה.
            </p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {step === 'working' ? <p className="status" role="status">מוחקים את החשבון…</p> : null}
            <button className="primary" type="button" onClick={onClose} disabled={busy} autoFocus>
              ביטול
            </button>
            <button className="secondary danger" type="button" onClick={start} disabled={busy}>
              {busy ? 'מוחקים…' : 'מחיקת החשבון'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
