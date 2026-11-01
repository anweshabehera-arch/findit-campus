import { useEffect, useState, useMemo } from 'react';
import { db } from './firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';

function StudentDashboard({
  currentUser,
  userProfile,
  onBack,
  onLogout,
  initialTab = 'lost'
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [receivedClaims, setReceivedClaims] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reloadDashboard = () => setRefreshKey((k) => k + 1);

  // Load student data from Firestore
  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    async function fetchData() {
      try {
        // 1. Load items reported by this student
        const itemsQuery = query(
          collection(db, 'items'),
          where('reporterUid', '==', currentUser.uid)
        );
        const itemsSnap = await getDocs(itemsQuery);
        if (isCancelled) return;
        const userItems = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setLostItems(userItems.filter((item) => item.type === 'Lost' || item.status === 'Lost'));
        const found = userItems.filter((item) => item.type === 'Found' || item.status === 'Found' || item.type !== 'Lost');
        setFoundItems(found);

        // 2. Load claims received for items this student reported as found
        const receivedClaimsQuery = query(
          collection(db, 'claims'),
          where('reporterUid', '==', currentUser.uid)
        );
        const receivedSnap = await getDocs(receivedClaimsQuery);
        if (isCancelled) return;
        setReceivedClaims(receivedSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        // 3. Load claims submitted by this student
        const myClaimsQuery = query(
          collection(db, 'claims'),
          where('claimantUid', '==', currentUser.uid)
        );
        const myClaimsSnap = await getDocs(myClaimsQuery);
        if (isCancelled) return;
        setMyClaims(myClaimsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        // 4. Load notifications for this student
        const notifsQuery = query(
          collection(db, 'notifications'),
          where('recipientUid', '==', currentUser.uid)
        );
        const notifsSnap = await getDocs(notifsQuery);
        if (isCancelled) return;
        const notifsList = notifsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        notifsList.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt || 0)).getTime();
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt || 0)).getTime();
          return timeB - timeA;
        });
        setNotifications(notifsList);
      } catch (err) {
        if (!isCancelled) {
          console.warn('Dashboard data fetch warning:', err.message);
          setMessage({
            text: `Notice: Live dashboard data loaded with limitations. ${err.message}`,
            type: 'error'
          });
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, refreshKey]);

  // Compute metrics
  const unreadNotifsCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const pendingReceivedClaimsCount = useMemo(() => {
    return receivedClaims.filter((c) => c.status === 'pending').length;
  }, [receivedClaims]);

  // Claim approval handler
  const handleApproveClaim = async (claim, item) => {
    if (!currentUser) return;
    const confirmApprove = window.confirm(
      `Are you sure you want to approve ${claim.claimantName || claim.claimantEmail}'s claim for "${item.name}"? This will mark the item as Returned.`
    );
    if (!confirmApprove) return;

    setActionLoading(claim.id);
    setMessage(null);

    try {
      // 1. Update approved claim
      await updateDoc(doc(db, 'claims', claim.id), {
        status: 'approved',
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.uid
      });

      // 2. Update item status to Returned
      await updateDoc(doc(db, 'items', item.id), {
        status: 'Returned',
        resolvedAt: serverTimestamp(),
        resolvedClaimId: claim.id
      });

      // 3. Reject any other pending claims for this item
      const otherPendingClaims = receivedClaims.filter(
        (c) => c.itemId === item.id && c.id !== claim.id && c.status === 'pending'
      );

      for (const other of otherPendingClaims) {
        await updateDoc(doc(db, 'claims', other.id), {
          status: 'rejected',
          reviewedAt: serverTimestamp(),
          reviewedBy: currentUser.uid,
          rejectReason: 'Another claimant proved ownership and the item has been returned.'
        });

        // Notify other claimant
        await addDoc(collection(db, 'notifications'), {
          recipientUid: other.claimantUid,
          title: 'Claim Update',
          message: `The item "${item.name}" was returned to another verified owner. Your claim has been closed.`,
          type: 'claim_rejected',
          itemId: item.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      // 4. Notify approved claimant
      await addDoc(collection(db, 'notifications'), {
        recipientUid: claim.claimantUid,
        title: 'Claim Approved! 🎉',
        message: `Your claim for "${item.name}" has been approved! Connect with the finder at ${currentUser.email} to collect your item.`,
        type: 'claim_approved',
        itemId: item.id,
        read: false,
        createdAt: serverTimestamp()
      });

      setMessage({
        text: `Claim approved successfully! "${item.name}" is now marked as Returned.`,
        type: 'success'
      });

      reloadDashboard();
    } catch (err) {
      setMessage({ text: `Failed to approve claim: ${err.message}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Claim rejection handler
  const handleRejectClaim = async (claim, item) => {
    if (!currentUser) return;
    const confirmReject = window.confirm(
      `Reject claim from ${claim.claimantName || claim.claimantEmail}?`
    );
    if (!confirmReject) return;

    setActionLoading(claim.id);
    setMessage(null);

    try {
      // 1. Update claim status to rejected
      await updateDoc(doc(db, 'claims', claim.id), {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.uid
      });

      // 2. Check remaining pending claims for this item
      const remainingPending = receivedClaims.filter(
        (c) => c.itemId === item.id && c.id !== claim.id && c.status === 'pending'
      );

      if (remainingPending.length === 0 && item.status === 'Claim Pending') {
        await updateDoc(doc(db, 'items', item.id), {
          status: 'Available'
        });
      }

      // 3. Notify claimant
      await addDoc(collection(db, 'notifications'), {
        recipientUid: claim.claimantUid,
        title: 'Claim Not Approved',
        message: `Your claim request for "${item.name}" was not approved by the finder. Ownership proof could not be verified.`,
        type: 'claim_rejected',
        itemId: item.id,
        read: false,
        createdAt: serverTimestamp()
      });

      setMessage({
        text: `Claim rejected. The claimant has been notified.`,
        type: 'success'
      });

      reloadDashboard();
    } catch (err) {
      setMessage({ text: `Failed to reject claim: ${err.message}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Mark lost item as resolved
  const handleResolveLostItem = async (item) => {
    setActionLoading(item.id);
    setMessage(null);

    try {
      await updateDoc(doc(db, 'items', item.id), {
        status: 'Resolved',
        resolvedAt: serverTimestamp()
      });

      setMessage({
        text: `"${item.name}" has been marked as Resolved!`,
        type: 'success'
      });

      reloadDashboard();
    } catch (err) {
      setMessage({ text: `Failed to update status: ${err.message}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Mark notification as read
  const handleMarkNotifRead = async (notifId) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), {
        read: true
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.warn('Error marking notification as read:', err.message);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.read);
      for (const n of unread) {
        await updateDoc(doc(db, 'notifications', n.id), { read: true });
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setMessage({ text: 'All notifications marked as read.', type: 'success' });
    } catch (err) {
      setMessage({ text: `Error updating notifications: ${err.message}`, type: 'error' });
    }
  };

  return (
    <div className="student-dashboard-page">
      <div className="student-dashboard-container">
        {/* HEADER */}
        <header className="student-dash-header">
          <div className="student-dash-title-area">
            <span className="dash-badge">STUDENT PORTAL</span>
            <h1>My Campus Dashboard</h1>
            <p className="student-dash-subtitle">
              Welcome back, <strong>{userProfile?.name || currentUser?.email}</strong>
              {userProfile?.rollNumber && ` (Roll: ${userProfile.rollNumber})`}
            </p>
          </div>

          <div className="student-dash-actions">
            <button onClick={onBack} className="btn-dash-secondary">
              ← Back to Campus Home
            </button>
            <button onClick={loadDashboardData} disabled={loading} className="btn-dash-refresh">
              🔄 {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            {onLogout && (
              <button onClick={onLogout} className="btn-dash-logout">
                Logout
              </button>
            )}
          </div>
        </header>

        {/* FEEDBACK ALERT */}
        {message && (
          <div className={`dash-alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
            <span>{message.type === 'error' ? '⚠️' : '✓'} {message.text}</span>
            <button onClick={() => setMessage(null)} className="alert-close-btn">×</button>
          </div>
        )}

        {/* METRICS OVERVIEW */}
        <div className="student-stats-row">
          <div className="stat-card" onClick={() => setActiveTab('lost')}>
            <span className="stat-icon">🎒</span>
            <div className="stat-details">
              <span className="stat-num">{lostItems.length}</span>
              <span className="stat-label">Lost Reports</span>
            </div>
          </div>

          <div className="stat-card" onClick={() => setActiveTab('found')}>
            <span className="stat-icon">📦</span>
            <div className="stat-details">
              <span className="stat-num">{foundItems.length}</span>
              <span className="stat-label">Found Reports</span>
            </div>
            {pendingReceivedClaimsCount > 0 && (
              <span className="stat-badge-pulse">{pendingReceivedClaimsCount} Pending Claim{pendingReceivedClaimsCount > 1 ? 's' : ''}</span>
            )}
          </div>

          <div className="stat-card" onClick={() => setActiveTab('claims')}>
            <span className="stat-icon">✋</span>
            <div className="stat-details">
              <span className="stat-num">{myClaims.length}</span>
              <span className="stat-label">My Claims</span>
            </div>
          </div>

          <div className="stat-card" onClick={() => setActiveTab('notifications')}>
            <span className="stat-icon">🔔</span>
            <div className="stat-details">
              <span className="stat-num">{notifications.length}</span>
              <span className="stat-label">Notifications</span>
            </div>
            {unreadNotifsCount > 0 && (
              <span className="stat-badge-unread">{unreadNotifsCount} New</span>
            )}
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <nav className="student-dash-tabs">
          <button
            className={`dash-tab-btn ${activeTab === 'lost' ? 'active' : ''}`}
            onClick={() => setActiveTab('lost')}
          >
            My Lost Reports ({lostItems.length})
          </button>

          <button
            className={`dash-tab-btn ${activeTab === 'found' ? 'active' : ''}`}
            onClick={() => setActiveTab('found')}
          >
            My Found Items & Claims Received ({foundItems.length})
            {pendingReceivedClaimsCount > 0 && (
              <span className="tab-pill-alert">{pendingReceivedClaimsCount}</span>
            )}
          </button>

          <button
            className={`dash-tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
            onClick={() => setActiveTab('claims')}
          >
            My Submitted Claims ({myClaims.length})
          </button>

          <button
            className={`dash-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications ({notifications.length})
            {unreadNotifsCount > 0 && (
              <span className="tab-pill-alert">{unreadNotifsCount}</span>
            )}
          </button>
        </nav>

        {/* TAB CONTENTS */}
        <main className="student-dash-content">
          {loading ? (
            <div className="dash-empty-card">
              <div className="admin-spinner"></div>
              <p>Loading your dashboard records...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: MY LOST REPORTS */}
              {activeTab === 'lost' && (
                <section className="tab-section">
                  <div className="tab-section-header">
                    <h2>Items You Reported as Lost</h2>
                    <p>Track belongings you misplaced on campus.</p>
                  </div>

                  {lostItems.length === 0 ? (
                    <div className="dash-empty-card">
                      <span className="empty-icon">🎒</span>
                      <h3>No Lost Reports Yet</h3>
                      <p>You haven't reported any lost items. Use "+ Report Item" from the homepage whenever you need help locating misplaced items.</p>
                    </div>
                  ) : (
                    <div className="dash-items-grid">
                      {lostItems.map((item) => {
                        const isResolved = item.status === 'Resolved';
                        const isProcessing = actionLoading === item.id;

                        return (
                          <article key={item.id} className="dash-item-card">
                            <div className="dash-card-top">
                              <span className="item-icon-circle">{item.icon || '📦'}</span>
                              <div>
                                <h3>{item.name}</h3>
                                <span className={`status-pill ${isResolved ? 'status-resolved' : 'status-available'}`}>
                                  {item.status || 'Available'}
                                </span>
                              </div>
                            </div>

                            <div className="dash-card-meta">
                              <p><strong>Category:</strong> {item.category}</p>
                              <p><strong>Location:</strong> 📍 {item.location}</p>
                              <p><strong>Description:</strong> {item.description || 'No description'}</p>
                              {item.imageUrl && (
                                <img src={item.imageUrl} alt={item.name} className="dash-item-thumb" />
                              )}
                            </div>

                            <div className="dash-card-actions">
                              {!isResolved ? (
                                <button
                                  className="btn-mark-resolved"
                                  onClick={() => handleResolveLostItem(item)}
                                  disabled={isProcessing}
                                >
                                  {isProcessing ? 'Updating...' : '✓ Mark as Recovered / Resolved'}
                                </button>
                              ) : (
                                <span className="resolved-checkmark">✓ Recovered & Resolved</span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* TAB 2: MY FOUND ITEMS & RECEIVED CLAIMS */}
              {activeTab === 'found' && (
                <section className="tab-section">
                  <div className="tab-section-header">
                    <h2>Found Items You Reported & Incoming Ownership Claims</h2>
                    <p>Review and verify claims submitted by students claiming ownership of items you turned in.</p>
                  </div>

                  {foundItems.length === 0 ? (
                    <div className="dash-empty-card">
                      <span className="empty-icon">🤝</span>
                      <h3>No Found Items Reported</h3>
                      <p>Thank you for helping our campus community! If you discover misplaced items anywhere on campus, submit a Found report.</p>
                    </div>
                  ) : (
                    <div className="found-items-list">
                      {foundItems.map((item) => {
                        const itemClaims = receivedClaims.filter((c) => c.itemId === item.id);
                        const pendingClaims = itemClaims.filter((c) => c.status === 'pending');
                        const isReturned = item.status === 'Returned' || item.status === 'Resolved';

                        return (
                          <div key={item.id} className="found-item-wrapper">
                            <div className="found-item-header">
                              <div className="found-item-title-box">
                                <span className="item-icon-circle">{item.icon || '🧴'}</span>
                                <div>
                                  <h3>{item.name}</h3>
                                  <span className="found-location-text">Found at: {item.location} • Category: {item.category}</span>
                                </div>
                              </div>

                              <span className={`status-pill ${isReturned ? 'status-returned' : pendingClaims.length > 0 ? 'status-pending' : 'status-available'}`}>
                                {item.status || 'Available'}
                              </span>
                            </div>

                            {/* CLAIMS ON THIS ITEM */}
                            <div className="claims-review-section">
                              <h4 className="claims-review-title">
                                Ownership Claims ({itemClaims.length})
                              </h4>

                              {itemClaims.length === 0 ? (
                                <p className="no-claims-text">No student claims submitted yet for this item.</p>
                              ) : (
                                <div className="claims-grid">
                                  {itemClaims.map((claim) => {
                                    const isPending = claim.status === 'pending';
                                    const isApproved = claim.status === 'approved';
                                    const isClaimProcessing = actionLoading === claim.id;

                                    return (
                                      <div key={claim.id} className={`claim-review-card claim-status-${claim.status}`}>
                                        <div className="claim-review-header">
                                          <div>
                                            <strong>{claim.claimantName || 'Student'}</strong>
                                            <span className="claimant-subtext"> ({claim.claimantEmail})</span>
                                            {claim.claimantRollNumber && (
                                              <span className="roll-badge">Roll: {claim.claimantRollNumber}</span>
                                            )}
                                          </div>
                                          <span className={`status-pill status-${claim.status}`}>
                                            {claim.status === 'approved' ? '✓ Approved' : claim.status === 'rejected' ? '✕ Rejected' : 'Pending Review'}
                                          </span>
                                        </div>

                                        <div className="claim-explanation-box">
                                          <span className="explanation-label">Ownership Proof Explanation:</span>
                                          <p className="explanation-text">"{claim.explanation}"</p>
                                        </div>

                                        {isPending && !isReturned && (
                                          <div className="claim-review-actions">
                                            <button
                                              className="admin-btn-approve"
                                              onClick={() => handleApproveClaim(claim, item)}
                                              disabled={isClaimProcessing}
                                            >
                                              {isClaimProcessing ? 'Processing...' : '✓ Approve & Handover'}
                                            </button>

                                            <button
                                              className="admin-btn-reject"
                                              onClick={() => handleRejectClaim(claim, item)}
                                              disabled={isClaimProcessing}
                                            >
                                              {isClaimProcessing ? 'Processing...' : '✕ Reject Proof'}
                                            </button>
                                          </div>
                                        )}

                                        {isApproved && (
                                          <div className="claim-approved-banner">
                                            ✓ Verified owner. Contact student at {claim.claimantEmail} to coordinate pickup.
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* TAB 3: MY SUBMITTED CLAIMS */}
              {activeTab === 'claims' && (
                <section className="tab-section">
                  <div className="tab-section-header">
                    <h2>Claims You Have Submitted</h2>
                    <p>Track verification progress of your ownership requests on found campus belongings.</p>
                  </div>

                  {myClaims.length === 0 ? (
                    <div className="dash-empty-card">
                      <span className="empty-icon">✋</span>
                      <h3>No Claim Requests Submitted</h3>
                      <p>Browse reported Found items on the homepage. When you see your lost belongings, click "Claim This Item" to submit ownership proof.</p>
                    </div>
                  ) : (
                    <div className="my-claims-grid">
                      {myClaims.map((claim) => (
                        <article key={claim.id} className={`my-claim-card my-claim-${claim.status}`}>
                          <div className="my-claim-top">
                            <h3>{claim.itemName}</h3>
                            <span className={`status-pill status-${claim.status}`}>
                              {claim.status === 'approved' ? '✓ Approved' : claim.status === 'rejected' ? '✕ Rejected' : '⏳ Pending Review'}
                            </span>
                          </div>

                          <p className="my-claim-loc">📍 Location: {claim.itemLocation || 'Campus'}</p>

                          <div className="my-claim-submitted-proof">
                            <span className="explanation-label">Your Submitted Proof:</span>
                            <p>"{claim.explanation}"</p>
                          </div>

                          <div className="my-claim-footer">
                            {claim.status === 'approved' && (
                              <p className="claim-approved-note">
                                🎉 <strong>Approved!</strong> Contact the finder at <u>{claim.reporterEmail || 'Campus Admin'}</u> to retrieve your item.
                              </p>
                            )}
                            {claim.status === 'rejected' && (
                              <p className="claim-rejected-note">
                                ❌ Claim not approved. Ownership proof could not be verified by the finder.
                              </p>
                            )}
                            {claim.status === 'pending' && (
                              <p className="claim-pending-note">
                                ⏳ Waiting for finder or college administrator to review your explanation.
                              </p>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* TAB 4: NOTIFICATIONS */}
              {activeTab === 'notifications' && (
                <section className="tab-section">
                  <div className="tab-section-header">
                    <div className="notif-header-title">
                      <h2>Your Notifications</h2>
                      {unreadNotifsCount > 0 && (
                        <button onClick={handleMarkAllRead} className="btn-mark-all-read">
                          ✓ Mark all as read
                        </button>
                      )}
                    </div>
                    <p>Stay updated on claim reviews, registration approvals, and status changes.</p>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="dash-empty-card">
                      <span className="empty-icon">🔔</span>
                      <h3>No Notifications Yet</h3>
                      <p>You'll receive notifications here when someone claims an item you found or when your claim is reviewed.</p>
                    </div>
                  ) : (
                    <div className="notifications-list">
                      {notifications.map((n) => {
                        const notifDate = n.createdAt?.toDate
                          ? n.createdAt.toDate().toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Recent';

                        return (
                          <div
                            key={n.id}
                            className={`notif-card ${!n.read ? 'notif-unread' : ''}`}
                            onClick={() => !n.read && handleMarkNotifRead(n.id)}
                          >
                            <div className="notif-icon-box">
                              {n.type === 'claim_approved' ? '🎉' :
                               n.type === 'claim_rejected' ? '❌' :
                               n.type === 'claim_received' ? '✋' :
                               n.type === 'account_approved' ? '🎓' : '🔔'}
                            </div>

                            <div className="notif-body">
                              <div className="notif-top-line">
                                <h4>{n.title}</h4>
                                <span className="notif-time">{notifDate}</span>
                              </div>
                              <p>{n.message}</p>
                            </div>

                            {!n.read && (
                              <button
                                className="btn-read-dot"
                                title="Mark as read"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkNotifRead(n.id);
                                }}
                              >
                                ●
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default StudentDashboard;
