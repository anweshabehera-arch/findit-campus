import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';

function AdminDashboard({ onBack, onLogout }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadStudents = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'users'));

      const pendingStudents = snapshot.docs
        .map((studentDoc) => ({
          id: studentDoc.id,
          ...studentDoc.data()
        }))
        .filter((student) => student.approvalStatus === 'pending');

      setStudents(pendingStudents);
    } catch (error) {
      setMessage({ text: `Failed to load students: ${error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Secure authorization check before querying any student data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAuthorized(false);
        setAuthChecking(false);
        setLoading(false);
        return;
      }

      try {
        // Authoritative Admin Check: Verify that admins/{uid} exists
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (adminDoc.exists()) {
          setIsAuthorized(true);
          setAuthChecking(false);
          // Only load student records once admin authorization is confirmed
          await loadStudents();
        } else {
          setIsAuthorized(false);
          setAuthChecking(false);
          setLoading(false);
        }
      } catch (err) {
        setIsAuthorized(false);
        setAuthChecking(false);
        setLoading(false);
        setMessage({ text: `Authorization error: ${err.message}`, type: 'error' });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleApproval = async (studentId, status) => {
    if (!auth.currentUser) {
      setMessage({ text: 'Session expired. Please log in again.', type: 'error' });
      return;
    }

    try {
      setActionLoading(studentId);
      setMessage(null);

      // Comply with published Firestore security rules
      await updateDoc(doc(db, 'users', studentId), {
        approvalStatus: status,
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser.uid
      });

      // Send in-app notification to the student
      try {
        await addDoc(collection(db, 'notifications'), {
          recipientUid: studentId,
          title: status === 'approved' ? 'Registration Approved 🎉' : 'Registration Status Update',
          message: status === 'approved'
            ? 'Your student account has been approved by the college administrator. Welcome to FindIt Campus!'
            : 'Your registration was reviewed and not approved by the administrator.',
          type: status === 'approved' ? 'account_approved' : 'account_rejected',
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn('Notification notice:', notifErr.message);
      }

      setMessage({
        text: `Student ${status === 'approved' ? 'approved' : 'rejected'} successfully.`,
        type: 'success'
      });

      // Refresh pending list
      await loadStudents();
    } catch (error) {
      setMessage({ text: `Action failed: ${error.message}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    try {
      if (onLogout) {
        await onLogout();
      } else {
        await signOut(auth);
        window.location.href = '/';
      }
    } catch (err) {
      setMessage({ text: `Logout failed: ${err.message}`, type: 'error' });
    }
  };

  // Filter students based on admin search query
  const filteredStudents = students.filter((student) => {
    const q = searchQuery.toLowerCase();
    const name = (student.name || '').toLowerCase();
    const email = (student.email || '').toLowerCase();
    const roll = (student.rollNumber || '').toLowerCase();
    return name.includes(q) || email.includes(q) || roll.includes(q);
  });

  // State 1: Verifying credentials
  if (authChecking) {
    return (
      <div className="admin-status-wrapper">
        <div className="admin-status-card">
          <div className="admin-spinner"></div>
          <h2>Verifying Admin Authorization...</h2>
          <p>Confirming your permissions with FindIt Campus.</p>
        </div>
      </div>
    );
  }

  // State 2: Unauthorized / Access Denied
  if (!isAuthorized) {
    return (
      <div className="admin-status-wrapper">
        <div className="admin-status-card admin-denied">
          <div className="admin-denied-icon">🚫</div>
          <h2>Access Denied</h2>
          <p>
            Your account does not have administrator privileges.
            Only verified college administrators can access this portal.
          </p>
          <div className="admin-denied-actions">
            {onBack && (
              <button onClick={onBack} className="admin-btn-secondary">
                ← Return to Home
              </button>
            )}
            <button onClick={handleLogout} className="admin-btn-danger">
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Authorized Admin Dashboard
  return (
    <div className="admin-page-bg">
      <div className="admin-container">
        {/* TOP BAR / HEADER */}
        <header className="admin-header">
          <div className="admin-title-area">
            <span className="admin-badge">ADMINISTRATOR PORTAL</span>
            <h1>Student Registration Approvals</h1>
            <p className="admin-subtitle">
              Verify and manage pending student accounts for FindIt Campus.
            </p>
          </div>

          <div className="admin-header-actions">
            {onBack && (
              <button onClick={onBack} className="admin-btn-secondary">
                ← Back to Home
              </button>
            )}

            <button
              onClick={loadStudents}
              disabled={loading}
              className="admin-btn-refresh"
              title="Refresh student list"
            >
              🔄 {loading ? 'Refreshing...' : 'Refresh'}
            </button>

            <button onClick={handleLogout} className="admin-btn-danger">
              Logout
            </button>
          </div>
        </header>

        {/* FEEDBACK ALERT MESSAGE */}
        {message && (
          <div className={`admin-alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
            <span>{message.type === 'error' ? '⚠️' : '✓'} {message.text}</span>
            <button onClick={() => setMessage(null)} className="alert-close-btn">×</button>
          </div>
        )}

        {/* METRICS & SEARCH TOOLBAR */}
        <div className="admin-toolbar">
          <div className="admin-metric-card">
            <span className="metric-label">PENDING REGISTRATIONS</span>
            <span className="metric-value">{students.length}</span>
          </div>

          <div className="admin-search-box">
            <input
              type="text"
              placeholder="Search by name, email or roll number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="clear-search-btn">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* STUDENTS LIST */}
        <div className="admin-content-area">
          {loading ? (
            <div className="admin-empty-card">
              <div className="admin-spinner"></div>
              <p>Loading pending student registrations...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="admin-empty-card">
              <span className="empty-icon">🎉</span>
              <h3>No Pending Registrations</h3>
              <p>All student account registrations have been reviewed.</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="admin-empty-card">
              <span className="empty-icon">🔍</span>
              <h3>No Matches Found</h3>
              <p>No pending students match "{searchQuery}".</p>
            </div>
          ) : (
            <div className="admin-students-grid">
              {filteredStudents.map((student) => {
                const isProcessing = actionLoading === student.id;
                const formattedDate = student.createdAt?.toDate
                  ? student.createdAt.toDate().toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : null;

                return (
                  <article key={student.id} className="admin-student-card">
                    <div className="student-card-header">
                      <div className="student-avatar">
                        {(student.name || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div className="student-header-text">
                        <h3>{student.name || 'Unnamed Student'}</h3>
                        <span className="student-status-tag">Pending Review</span>
                      </div>
                    </div>

                    <div className="student-details-list">
                      <div className="detail-row">
                        <span className="detail-label">Email:</span>
                        <span className="detail-value">{student.email || 'N/A'}</span>
                      </div>

                      <div className="detail-row">
                        <span className="detail-label">Roll Number:</span>
                        <span className="detail-value roll-badge">
                          {student.rollNumber || 'N/A'}
                        </span>
                      </div>

                      {formattedDate && (
                        <div className="detail-row">
                          <span className="detail-label">Registered:</span>
                          <span className="detail-value">{formattedDate}</span>
                        </div>
                      )}
                    </div>

                    <div className="student-actions">
                      <button
                        onClick={() => handleApproval(student.id, 'approved')}
                        disabled={isProcessing}
                        className="admin-btn-approve"
                      >
                        {isProcessing ? 'Processing...' : '✓ Approve'}
                      </button>

                      <button
                        onClick={() => handleApproval(student.id, 'rejected')}
                        disabled={isProcessing}
                        className="admin-btn-reject"
                      >
                        {isProcessing ? 'Processing...' : '✕ Reject'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;