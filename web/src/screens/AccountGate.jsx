import { useEffect, useState } from 'react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import Stage from '../Stage';
import { authErrorMessage, publicName } from '../account';
import {
  NICKNAME_TAKEN,
  claimNickname,
  cleanNickname,
  nicknameAvailable,
  nicknameProblem,
} from '../nickname';

function Shell({ title, children }) {
  return (
    <Stage className="stage-home">
      <main className="home-page">
        <section className="home-actions account-gate" aria-label={title}>
          <div className="mail-form">
            <h2>{title}</h2>
            {children}
          </div>
        </section>
      </main>
    </Stage>
  );
}

async function quietSignOut() {
  try { await signOut(auth); } catch (error) { console.error(error); }
}

export function VerifyEmailScreen({ user, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  // Pick up the verification as soon as the player returns to the tab.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') onRefresh().catch(() => {}); };
    const id = window.setInterval(check, 5000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', check);
    };
  }, [onRefresh]);

  async function checkNow() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const verified = await onRefresh();
      if (!verified) setNotice('האימייל עדיין לא אומת. לחצו על הקישור שנשלח אליכם.');
    } catch (refreshError) {
      console.error(refreshError);
      setError(authErrorMessage(refreshError, 'הבדיקה נכשלה. נסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendEmailVerification(user);
      setNotice('שלחנו קישור אימות חדש.');
      setCooldown(60);
    } catch (sendError) {
      console.error(sendError);
      setError(authErrorMessage(sendError, 'לא הצלחנו לשלוח את הקישור. נסו שוב.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="בדקו את האימייל שלכם">
      <p className="form-note">
        שלחנו קישור אימות אל <bdi dir="ltr">{user.email}</bdi>.
        {' '}
        לחצו על הקישור כדי להפעיל את החשבון. אם לא קיבלתם, בדקו גם בתיקיית הספאם.
      </p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-note" role="status">{notice}</p> : null}
      <button className="primary" type="button" onClick={checkNow} disabled={busy}>
        {busy ? 'רגע…' : 'אימתתי, המשך'}
      </button>
      <div className="form-links">
        <button className="text-button" type="button" onClick={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `שליחה מחדש (${cooldown})` : 'שליחת הקישור מחדש'}
        </button>
        <button className="text-button danger" type="button" onClick={quietSignOut}>
          התנתקות
        </button>
      </div>
    </Shell>
  );
}

export function NicknameScreen({ user, suggested = '', autoClaim = false, onDone }) {
  const accountName = publicName(cleanNickname(user.displayName), '');
  const isGoogle = (user.providerData || []).some((entry) => entry.providerId === 'google.com');
  const [choice, setChoice] = useState(isGoogle && accountName && !suggested ? 'account' : 'new');
  const [name, setName] = useState(suggested || (isGoogle ? '' : accountName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountTaken, setAccountTaken] = useState(false);

  async function claim(value) {
    const problem = nicknameProblem(value);
    if (problem) {
      setError(problem);
      return false;
    }
    setBusy(true);
    setError('');
    try {
      if (!(await nicknameAvailable(value, user.uid))) {
        setError(NICKNAME_TAKEN);
        return false;
      }
      const profile = await claimNickname(user, value);
      onDone(profile);
      return true;
    } catch (claimError) {
      console.error(claimError);
      setError(claimError?.code === 'nickname/taken' ? NICKNAME_TAKEN : 'לא הצלחנו לשמור את הכינוי. נסו שוב.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoClaim && suggested) claim(suggested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (choice === 'account') {
      const ok = await claim(accountName);
      if (!ok) {
        setAccountTaken(true);
        setChoice('new');
        setError(`השם ${accountName} כבר תפוס. בחרו כינוי חדש.`);
      }
      return;
    }
    await claim(name);
  }

  return (
    <Shell title="איך לקרוא לך?">
      <p className="form-note">הכינוי יופיע בטבלת התוצאות. כל כינוי ייחודי לשחקן אחד.</p>
      <form onSubmit={submit} noValidate>
        {isGoogle && accountName ? (
          <div className="nickname-choices" role="radiogroup" aria-label="בחירת שם">
            <label className={accountTaken ? 'nickname-choice is-disabled' : 'nickname-choice'}>
              <input
                type="radio"
                name="nickname-choice"
                checked={choice === 'account'}
                onChange={() => setChoice('account')}
                disabled={busy || accountTaken}
              />
              <span>להיקרא <bdi>{accountName}</bdi></span>
            </label>
            <label className="nickname-choice">
              <input
                type="radio"
                name="nickname-choice"
                checked={choice === 'new'}
                onChange={() => setChoice('new')}
                disabled={busy}
              />
              <span>ליצור כינוי חדש</span>
            </label>
          </div>
        ) : null}
        {choice === 'new' ? (
          <>
            <label htmlFor="nickname">כינוי</label>
            <input
              id="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="nickname"
              maxLength={24}
              disabled={busy}
              autoFocus
            />
          </>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'בודק…' : 'המשך'}
        </button>
      </form>
      <div className="form-links">
        <button className="text-button danger" type="button" onClick={quietSignOut}>
          התנתקות
        </button>
      </div>
    </Shell>
  );
}
