
import { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

function Register() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = form.get('name').trim();
    const email = form.get('email').trim();
    const rollNumber = form.get('rollNumber').trim();
    const password = form.get('password');

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', result.user.uid), {
        name,
        email,
        rollNumber,
        role: 'student',
        approvalStatus: 'pending',
        emailVerified: false,
        createdAt: serverTimestamp()
      });

      await sendEmailVerification(result.user);

      setMessage('Registration successful! Check your email to verify your account. Admin approval is also required.');
      e.currentTarget.reset();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <h2>Join FindIt Campus</h2>
      <p>Register using your student details.</p>

      <form onSubmit={handleRegister}>
        <input name="name" placeholder="Full name" required />
        <input name="email" type="email" placeholder="Personal Gmail" required />
        <input name="rollNumber" placeholder="College roll number" required />
        <input name="password" type="password" placeholder="Password (minimum 6 characters)" minLength="6" required />

        <button type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Create Account'}
        </button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}

export default Register;
