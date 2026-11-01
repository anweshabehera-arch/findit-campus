
import { useState } from 'react';
import { signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

function Login({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    const form = new FormData(e.currentTarget);
    const email = form.get('email').trim();
    const password = form.get('password');

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      await result.user.reload();

      // Check whether admins/{uid} document exists for this user
      const adminDoc = await getDoc(
        doc(db, 'admins', result.user.uid)
      );

      if (adminDoc.exists()) {
        // Authorized Admin: Bypass student approvalStatus checks
        setMessage({ text: 'Admin login successful! Redirecting...', type: 'success' });
        if (onLoginSuccess) {
          onLoginSuccess({ isAdmin: true, user: result.user });
        } else {
          window.location.href = '/';
        }
        return;
      }

      // Normal Student Flow
      // 1. Email verification check
      if (!result.user.emailVerified) {
        await sendEmailVerification(result.user);
        await auth.signOut();
        setMessage({
          text: 'Please verify your email. A verification link has been sent to your inbox.',
          type: 'error'
        });
        return;
      }

      // 2. Fetch student profile from users/{uid}
      const userDoc = await getDoc(
        doc(db, 'users', result.user.uid)
      );

      if (!userDoc.exists()) {
        await auth.signOut();
        setMessage({
          text: 'Student account details not found. Contact the administrator.',
          type: 'error'
        });
        return;
      }

      // 3. Student approval status check
      const studentData = userDoc.data();
      if (studentData.approvalStatus !== 'approved') {
        await auth.signOut();
        if (studentData.approvalStatus === 'rejected') {
          setMessage({
            text: 'Your registration was rejected by the college administrator.',
            type: 'error'
          });
        } else {
          setMessage({
            text: 'Your account is awaiting college admin approval.',
            type: 'error'
          });
        }
        return;
      }

      setMessage({ text: 'Login successful! Your account is approved.', type: 'success' });
      if (onLoginSuccess) {
        onLoginSuccess({ isAdmin: false, user: result.user });
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <h2>Welcome Back</h2>
      <p>Login to FindIt Campus</p>

      <form onSubmit={handleLogin}>
        <input
          name="email"
          type="email"
          placeholder="Personal Gmail"
          required
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      {message.text && (
        <p className={`auth-message ${message.type === 'error' ? 'auth-error' : 'auth-success'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export default Login;
