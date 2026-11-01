import { useState, useEffect, useMemo } from 'react';
import './App.css';
import Register from './Register';
import Login from './Login';
import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';
import { auth, db, storage } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const DEFAULT_SAMPLE_ITEMS = [
  {
    id: 'sample-item-1',
    name: 'Black Leather Wallet',
    category: 'Accessories',
    location: 'Central Library 2nd Floor',
    type: 'Lost',
    status: 'Available',
    icon: '👛',
    description: 'Black leather wallet with university ID card lost near study cubicles.',
    imageUrl: '',
    reporterUid: 'system-sample-1',
    reporterName: 'Campus Security',
    reporterEmail: 'security@finditcampus.edu',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'sample-item-2',
    name: 'Stainless Steel Water Bottle',
    category: 'Accessories',
    location: 'Student Canteen',
    type: 'Found',
    status: 'Available',
    icon: '🧴',
    description: 'Blue insulated water bottle left on cafeteria table near Counter 3.',
    imageUrl: '',
    reporterUid: 'system-sample-2',
    reporterName: 'Canteen Staff',
    reporterEmail: 'canteen@finditcampus.edu',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'sample-item-3',
    name: 'Casio Scientific Calculator',
    category: 'Electronics',
    location: 'Block A, Room 102',
    type: 'Found',
    status: 'Available',
    icon: '🧮',
    description: 'Casio FX-991ES Plus calculator found on back bench after math exam.',
    imageUrl: '',
    reporterUid: 'system-sample-3',
    reporterName: 'Department Staff',
    reporterEmail: 'academics@finditcampus.edu',
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

function getCategoryIcon(cat) {
  switch (cat) {
    case 'Electronics':
      return '💻';
    case 'Books':
      return '📚';
    case 'Clothing':
      return '👕';
    case 'Accessories':
      return '🎒';
    default:
      return '📦';
  }
}

function App() {
  // Navigation & View States
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#admin'
  );
  const [showStudentDashboard, setShowStudentDashboard] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#student'
  );
  const [studentDashboardTab, setStudentDashboardTab] = useState('lost');

  // Auth & Profile State
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  // Items State (Permanent in Firestore with sample fallback)
  const [items, setItems] = useState(DEFAULT_SAMPLE_ITEMS);
  const [loadingItems, setLoadingItems] = useState(true);

  // Search & Filter States
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All'); // All, Lost, Found
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All'); // All, Available, Claim Pending, Returned, Resolved
  const [locationFilter, setLocationFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest

  // Report Modal States
  const [showForm, setShowForm] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState('Lost');
  const [reportImageFile, setReportImageFile] = useState(null);
  const [reportImagePreview, setReportImagePreview] = useState(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccessMessage, setReportSuccessMessage] = useState('');

  // Item Details & Claim States
  const [selectedItem, setSelectedItem] = useState(null);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimExplanation, setClaimExplanation] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [receivedClaimsForItem, setReceivedClaimsForItem] = useState([]);
  const [loadingItemClaims, setLoadingItemClaims] = useState(false);
  const [userClaimOnSelectedItem, setUserClaimOnSelectedItem] = useState(null);
  const [claimActionLoading, setClaimActionLoading] = useState(null);

  // 1. URL Hash Synchronization
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#admin') {
        setShowAdminDashboard(true);
        setShowStudentDashboard(false);
      } else if (hash === '#student') {
        setShowStudentDashboard(true);
        setShowAdminDashboard(false);
      } else {
        setShowAdminDashboard(false);
        setShowStudentDashboard(false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 2. Authentication & Admin/User Profile Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          // Authoritative admin check: verify admins/{uid} document exists
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));
          if (adminDoc.exists()) {
            setIsAdmin(true);
            setUserProfile({
              name: 'Administrator',
              email: user.email,
              role: 'admin'
            });
          } else {
            setIsAdmin(false);
            if (window.location.hash === '#admin') {
              window.location.hash = '';
              setShowAdminDashboard(false);
            }
            // Fetch student profile from users/{uid}
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              setUserProfile(userDoc.data());
            }
          }
        } catch (err) {
          console.warn('Error fetching user profile:', err.message);
          setIsAdmin(false);
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setUserProfile(null);
        setUnreadNotifsCount(0);
        setShowAdminDashboard(false);
        setShowStudentDashboard(false);
        if (window.location.hash === '#admin' || window.location.hash === '#student') {
          window.location.hash = '';
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 3. Real-Time Items Subscription from Firestore
  useEffect(() => {
    let unsubscribe = () => {};

    try {
      const itemsQuery = query(collection(db, 'items'), orderBy('createdAt', 'desc'));

      unsubscribe = onSnapshot(
        itemsQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            const firestoreItems = snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...docSnap.data(),
              // Normalize status and type
              type: docSnap.data().type || docSnap.data().status || 'Lost',
              status: docSnap.data().status === 'Lost' || docSnap.data().status === 'Found'
                ? 'Available'
                : (docSnap.data().status || 'Available')
            }));
            setItems(firestoreItems);
          } else {
            // Seed with sample items if collection is empty
            setItems(DEFAULT_SAMPLE_ITEMS);
          }
          setLoadingItems(false);
        },
        (err) => {
          console.warn('Firestore items subscription fallback:', err.message);
          // Fall back gracefully to sample items
          setItems(DEFAULT_SAMPLE_ITEMS);
          setLoadingItems(false);
        }
      );
    } catch (err) {
      console.warn('Items setup warning:', err.message);
    }

    return () => unsubscribe();
  }, []);

  // 4. Real-Time Notifications Listener for Current User
  useEffect(() => {
    if (!currentUser) return;

    let unsubscribe = () => {};
    try {
      const notifsQuery = query(
        collection(db, 'notifications'),
        where('recipientUid', '==', currentUser.uid)
      );

      unsubscribe = onSnapshot(
        notifsQuery,
        (snapshot) => {
          const unread = snapshot.docs.filter((d) => !d.data().read).length;
          setUnreadNotifsCount(unread);
        },
        (err) => {
          console.warn('Notifications listener warning:', err.message);
        }
      );
    } catch (err) {
      console.warn('Notification setup error:', err);
    }

    return () => unsubscribe();
  }, [currentUser]);

  // 5. Load Claims on Selected Item (for reporter/admin review or claimant check)
  useEffect(() => {
    if (!selectedItem) return;

    let isMounted = true;
    const fetchClaimsForItem = async () => {
      setLoadingItemClaims(true);
      try {
        const claimsQuery = query(
          collection(db, 'claims'),
          where('itemId', '==', selectedItem.id)
        );
        const snap = await getDocs(claimsQuery);
        const claimsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (isMounted) {
          setReceivedClaimsForItem(claimsList);

          // Check if current user has already claimed this item
          if (currentUser) {
            const myClaim = claimsList.find((c) => c.claimantUid === currentUser.uid);
            setUserClaimOnSelectedItem(myClaim || null);
          }
        }
      } catch (err) {
        console.warn('Could not load claims for item:', err.message);
      } finally {
        if (isMounted) setLoadingItemClaims(false);
      }
    };

    fetchClaimsForItem();
    return () => {
      isMounted = false;
    };
  }, [selectedItem, currentUser]);

  // Auth Logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setIsAdmin(false);
      setUserProfile(null);
      setShowAdminDashboard(false);
      setShowStudentDashboard(false);
      setShowLogin(false);
      setShowRegister(false);
      if (window.location.hash) window.location.hash = '';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        // Search filter (name, location, description, category)
        const q = search.trim().toLowerCase();
        const matchesSearch =
          !q ||
          `${item.name || ''} ${item.location || ''} ${item.description || ''} ${item.category || ''}`
            .toLowerCase()
            .includes(q);

        // Type filter (Lost / Found)
        const itemType = (item.type || item.status || '').toLowerCase();
        const matchesType =
          typeFilter === 'All' ||
          (typeFilter === 'Lost' && itemType === 'lost') ||
          (typeFilter === 'Found' && itemType === 'found');

        // Category filter
        const matchesCategory =
          categoryFilter === 'All' || item.category === categoryFilter;

        // Status filter (Available, Claim Pending, Returned, Resolved)
        const matchesStatus =
          statusFilter === 'All' || (item.status || 'Available') === statusFilter;

        // Location filter
        const matchesLocation =
          !locationFilter.trim() ||
          (item.location || '')
            .toLowerCase()
            .includes(locationFilter.trim().toLowerCase());

        return matchesSearch && matchesType && matchesCategory && matchesStatus && matchesLocation;
      })
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : new Date(b.createdAt || 0).getTime();
        return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
      });
  }, [items, search, typeFilter, categoryFilter, statusFilter, locationFilter, sortBy]);

  // Item Modal Handlers
  const openItemDetails = (item) => {
    setSelectedItem(item);
    setShowClaimForm(false);
    setClaimSuccess(false);
    setClaimExplanation('');
    setClaimError('');
  };

  const closeItemModal = () => {
    setSelectedItem(null);
    setShowClaimForm(false);
    setClaimSuccess(false);
    setClaimExplanation('');
    setClaimError('');
    setReceivedClaimsForItem([]);
    setUserClaimOnSelectedItem(null);
  };

  // Open Report Modal
  const openReportForm = (status) => {
    if (!currentUser) {
      setShowLogin(true);
      return;
    }
    setDefaultStatus(status);
    setReportError('');
    setReportImageFile(null);
    setReportImagePreview(null);
    setShowForm(true);
  };

  // Handle Photo Selection
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setReportError('Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setReportError('Image size must be 5MB or less.');
      return;
    }

    setReportError('');
    setReportImageFile(file);
    setReportImagePreview(URL.createObjectURL(file));
  };

  // Handle Report Submission (Firestore + optional Firebase Storage)
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    setReportError('');

    if (!currentUser) {
      setReportError('You must be logged in to report an item.');
      return;
    }

    // Check student approval
    if (!isAdmin && userProfile?.approvalStatus && userProfile.approvalStatus !== 'approved') {
      setReportError('Your student account is awaiting administrator approval before you can submit reports.');
      return;
    }

    const form = e.currentTarget;
    const data = new FormData(form);
    const name = data.get('name').trim();
    const status = data.get('status');
    const category = data.get('category');
    const location = data.get('location').trim();
    const description = data.get('description').trim();

    if (!name || !location || !description || !category) {
      setReportError('Please complete all required fields.');
      return;
    }

    setSubmittingReport(true);
    let uploadedImageUrl = '';

    // Step 1: Upload photo to Firebase Storage if provided
    if (reportImageFile) {
      try {
        const fileExt = reportImageFile.name.split('.').pop() || 'jpg';
        const storagePath = `items/${currentUser.uid}_${Date.now()}.${fileExt}`;
        const imageStorageRef = ref(storage, storagePath);

        const uploadResult = await uploadBytes(imageStorageRef, reportImageFile);
        uploadedImageUrl = await getDownloadURL(uploadResult.ref);
      } catch (storageErr) {
        console.warn('Storage upload notice (falling back without photo):', storageErr.message);
        // Continue creating report even if Storage is restricted or unconfigured
      }
    }

    // Step 2: Save report to Firestore
    try {
      const newReportData = {
        name,
        category,
        location,
        description,
        type: status, // 'Lost' | 'Found'
        status: 'Available',
        icon: getCategoryIcon(category),
        imageUrl: uploadedImageUrl,
        reporterUid: currentUser.uid,
        reporterName: userProfile?.name || currentUser.email,
        reporterEmail: currentUser.email,
        reporterRollNumber: userProfile?.rollNumber || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'items'), newReportData);

      setShowForm(false);
      form.reset();
      setReportImageFile(null);
      setReportImagePreview(null);
      setDefaultStatus('Lost');

      setReportSuccessMessage(`"${name}" reported successfully to campus Lost & Found!`);
      setTimeout(() => setReportSuccessMessage(''), 5000);
    } catch (dbErr) {
      console.error('Error saving report to Firestore:', dbErr);
      setReportError(`Failed to save report: ${dbErr.message}`);
    } finally {
      setSubmittingReport(false);
    }
  };

  // Handle Claim Submission
  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    setClaimError('');

    if (!currentUser) {
      setClaimError('You must be logged in to claim an item.');
      return;
    }

    if (!isAdmin && userProfile?.approvalStatus && userProfile.approvalStatus !== 'approved') {
      setClaimError('Your student account must be approved by the college admin to submit claims.');
      return;
    }

    if (!claimExplanation.trim() || claimExplanation.trim().length < 10) {
      setClaimError('Please provide a detailed explanation proving your ownership (at least 10 characters).');
      return;
    }

    // Prevent self-claiming
    if (selectedItem.reporterUid && selectedItem.reporterUid === currentUser.uid) {
      setClaimError('You cannot submit an ownership claim on an item you reported.');
      return;
    }

    setClaimSubmitting(true);

    try {
      // 1. Prevent duplicate pending claims
      const existingClaimsQ = query(
        collection(db, 'claims'),
        where('itemId', '==', selectedItem.id),
        where('claimantUid', '==', currentUser.uid)
      );
      const existingSnap = await getDocs(existingClaimsQ);
      const alreadyPending = existingSnap.docs.some((d) => d.data().status === 'pending');

      if (alreadyPending) {
        setClaimError('You already have a pending claim for this item. Please wait for the finder to review it.');
        setClaimSubmitting(false);
        return;
      }

      // 2. Add claim record to Firestore
      const claimRecord = {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        itemType: selectedItem.type || 'Found',
        itemLocation: selectedItem.location,
        itemCategory: selectedItem.category,
        itemImageUrl: selectedItem.imageUrl || '',
        reporterUid: selectedItem.reporterUid || '',
        reporterEmail: selectedItem.reporterEmail || '',
        claimantUid: currentUser.uid,
        claimantEmail: currentUser.email,
        claimantName: userProfile?.name || currentUser.email,
        claimantRollNumber: userProfile?.rollNumber || '',
        explanation: claimExplanation.trim(),
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'claims'), claimRecord);

      // 3. Update item status to 'Claim Pending' if it was Available
      if (selectedItem.status === 'Available') {
        try {
          await updateDoc(doc(db, 'items', selectedItem.id), {
            status: 'Claim Pending',
            updatedAt: serverTimestamp()
          });
        } catch (itemUpdateErr) {
          console.warn('Item status update notice:', itemUpdateErr.message);
        }
      }

      // 4. Send notification to the item reporter
      if (selectedItem.reporterUid && selectedItem.reporterUid !== currentUser.uid) {
        try {
          await addDoc(collection(db, 'notifications'), {
            recipientUid: selectedItem.reporterUid,
            title: 'New Ownership Claim ✋',
            message: `${userProfile?.name || 'A student'} submitted an ownership claim for your found item: "${selectedItem.name}". Review proof in your Student Dashboard.`,
            type: 'claim_received',
            itemId: selectedItem.id,
            read: false,
            createdAt: serverTimestamp()
          });
        } catch (notifErr) {
          console.warn('Reporter notification notice:', notifErr.message);
        }
      }

      setClaimSuccess(true);
      setClaimExplanation('');
    } catch (err) {
      setClaimError(`Failed to submit claim: ${err.message}`);
    } finally {
      setClaimSubmitting(false);
    }
  };

  // Claim Review Actions from Modal (for Reporter or Admin)
  const handleModalApproveClaim = async (claim) => {
    if (!currentUser) return;
    const confirmApprove = window.confirm(
      `Approve ${claim.claimantName || claim.claimantEmail}'s claim for "${selectedItem.name}"? This marks the item as Returned.`
    );
    if (!confirmApprove) return;

    setClaimActionLoading(claim.id);
    try {
      await updateDoc(doc(db, 'claims', claim.id), {
        status: 'approved',
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.uid
      });

      await updateDoc(doc(db, 'items', selectedItem.id), {
        status: 'Returned',
        resolvedAt: serverTimestamp(),
        resolvedClaimId: claim.id
      });

      // Reject other claims
      const otherClaims = receivedClaimsForItem.filter((c) => c.id !== claim.id && c.status === 'pending');
      for (const other of otherClaims) {
        await updateDoc(doc(db, 'claims', other.id), {
          status: 'rejected',
          reviewedAt: serverTimestamp(),
          reviewedBy: currentUser.uid,
          rejectReason: 'Item was returned to another verified claimant'
        });
      }

      // Notify approved claimant
      await addDoc(collection(db, 'notifications'), {
        recipientUid: claim.claimantUid,
        title: 'Claim Approved! 🎉',
        message: `Your claim for "${selectedItem.name}" was approved! Contact the finder at ${currentUser.email} to coordinate retrieval.`,
        type: 'claim_approved',
        itemId: selectedItem.id,
        read: false,
        createdAt: serverTimestamp()
      });

      closeItemModal();
      setReportSuccessMessage(`Claim approved! "${selectedItem.name}" is now marked as Returned.`);
      setTimeout(() => setReportSuccessMessage(''), 5000);
    } catch (err) {
      alert(`Error approving claim: ${err.message}`);
    } finally {
      setClaimActionLoading(null);
    }
  };

  const handleModalRejectClaim = async (claim) => {
    if (!currentUser) return;
    const confirmReject = window.confirm(`Reject claim from ${claim.claimantName || claim.claimantEmail}?`);
    if (!confirmReject) return;

    setClaimActionLoading(claim.id);
    try {
      await updateDoc(doc(db, 'claims', claim.id), {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser.uid
      });

      await addDoc(collection(db, 'notifications'), {
        recipientUid: claim.claimantUid,
        title: 'Claim Not Approved',
        message: `Your claim request for "${selectedItem.name}" was not approved. The provided explanation could not be verified.`,
        type: 'claim_rejected',
        itemId: selectedItem.id,
        read: false,
        createdAt: serverTimestamp()
      });

      // Refresh claims list
      setReceivedClaimsForItem((prev) =>
        prev.map((c) => (c.id === claim.id ? { ...c, status: 'rejected' } : c))
      );
    } catch (err) {
      alert(`Error rejecting claim: ${err.message}`);
    } finally {
      setClaimActionLoading(null);
    }
  };

  // View Switch: Admin Dashboard (Protected for verified admins)
  if (showAdminDashboard && isAdmin) {
    return (
      <AdminDashboard
        onBack={() => {
          setShowAdminDashboard(false);
          if (window.location.hash === '#admin') window.location.hash = '';
        }}
        onLogout={handleLogout}
      />
    );
  }

  // View Switch: Student Dashboard (Protected for logged-in students)
  if (showStudentDashboard && currentUser) {
    return (
      <StudentDashboard
        currentUser={currentUser}
        userProfile={userProfile}
        initialTab={studentDashboardTab}
        onBack={() => {
          setShowStudentDashboard(false);
          if (window.location.hash === '#student') window.location.hash = '';
        }}
        onLogout={handleLogout}
      />
    );
  }

  // View Switch: Register
  if (showRegister) {
    return (
      <div>
        <button
          onClick={() => setShowRegister(false)}
          className="back-home-btn"
          style={{ margin: '15px', cursor: 'pointer' }}
        >
          ← Back to Home
        </button>
        <Register />
      </div>
    );
  }

  // View Switch: Login
  if (showLogin) {
    return (
      <div>
        <button
          onClick={() => setShowLogin(false)}
          className="back-home-btn"
          style={{ margin: '15px', cursor: 'pointer' }}
        >
          ← Back to Home
        </button>
        <Login
          onLoginSuccess={({ isAdmin: userIsAdmin }) => {
            setShowLogin(false);
            if (userIsAdmin) {
              setIsAdmin(true);
              setShowAdminDashboard(true);
              window.location.hash = '#admin';
            }
          }}
        />
      </div>
    );
  }

  // Permission check for viewing claims on item details
  const isReporterOrAdmin =
    currentUser && (isAdmin || (selectedItem && selectedItem.reporterUid === currentUser.uid));

  return (
    <div className="app">
      {/* FLOATING SUCCESS TOAST */}
      {reportSuccessMessage && (
        <div className="report-success-toast">
          ✓ {reportSuccessMessage}
        </div>
      )}

      {/* REPORT ITEM MODAL */}
      {showForm && (
        <div className="modal-overlay">
          <div className="report-modal">
            <button
              className="close-btn"
              onClick={() => {
                setShowForm(false);
                setReportImageFile(null);
                setReportImagePreview(null);
                setReportError('');
              }}
            >
              ×
            </button>

            <h2>Report an Item</h2>
            <p>Help reunite lost belongings with their owners on campus.</p>

            {reportError && (
              <div className="claim-error-box" style={{ marginBottom: '14px' }}>
                ⚠️ {reportError}
              </div>
            )}

            <form onSubmit={handleReportSubmit}>
              <label>Report Type</label>
              <select
                name="status"
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value)}
                required
              >
                <option value="Lost">I Lost Something (Lost Item)</option>
                <option value="Found">I Found Something (Found Item)</option>
              </select>

              <label>Item Name *</label>
              <input
                name="name"
                type="text"
                placeholder="e.g. Black Wallet, Casio Calculator, Blue Bottle"
                required
              />

              <label>Upload Item Photo (Optional)</label>
              <input
                type="file"
                name="image"
                accept="image/*"
                onChange={handleImageChange}
              />

              {reportImagePreview && (
                <div className="image-preview-box">
                  <img src={reportImagePreview} alt="Preview" className="upload-preview-thumb" />
                  <button
                    type="button"
                    className="btn-remove-preview"
                    onClick={() => {
                      setReportImageFile(null);
                      setReportImagePreview(null);
                    }}
                  >
                    ✕ Remove Photo
                  </button>
                </div>
              )}

              <label>Category *</label>
              <select name="category" required>
                <option value="">Select category</option>
                <option value="Electronics">Electronics (Laptops, Calculators, Headphones)</option>
                <option value="Accessories">Accessories (Wallets, Keys, Bags, Bottles)</option>
                <option value="Books">Books & Academic Material</option>
                <option value="Clothing">Clothing & Apparel</option>
                <option value="Other">Other Miscellaneous</option>
              </select>

              <label>Location *</label>
              <input
                name="location"
                type="text"
                placeholder="Where was it lost or found? (e.g. Block A, Library 2nd Floor, Canteen)"
                required
              />

              <label>Description *</label>
              <textarea
                name="description"
                placeholder="Provide distinctive features, brand, color, approximate date, or where the item can be retrieved..."
                required
              />

              <button type="submit" className="submit-btn" disabled={submittingReport}>
                {submittingReport ? 'Publishing Report...' : 'Submit Report'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ITEM DETAILS & CLAIM MODAL */}
      {selectedItem && (
        <div className="modal-overlay">
          <div className="report-modal item-details-modal">
            <button className="close-btn" onClick={closeItemModal}>
              ×
            </button>

            {claimSuccess ? (
              <div className="claim-success-card">
                <div className="claim-success-icon">✓</div>
                <h2>Claim Request Submitted!</h2>
                <p>
                  Your claim request for <strong>{selectedItem.name}</strong> has been received.
                </p>
                <div className="claim-summary-box">
                  <p><strong>Item:</strong> {selectedItem.name} ({selectedItem.location})</p>
                  <p><strong>Claimant:</strong> {currentUser?.email}</p>
                  <p><strong>Status:</strong> ⏳ Pending Finder Verification</p>
                </div>
                <p className="claim-next-steps">
                  The person who found this item has been notified. You can track this claim's progress under <strong>My Claims</strong> in your Student Dashboard.
                </p>
                <button className="submit-btn" onClick={closeItemModal}>
                  Done
                </button>
              </div>
            ) : showClaimForm ? (
              <div className="claim-form-container">
                <span className="claim-badge">CLAIM VERIFICATION</span>
                <h2>Prove Ownership</h2>
                <p className="claim-form-subtitle">
                  Item: <strong>{selectedItem.icon} {selectedItem.name}</strong> (Found at {selectedItem.location})
                </p>

                <form onSubmit={handleClaimSubmit} className="claim-form">
                  <label>
                    Ownership Explanation <span className="required-star">*</span>
                  </label>
                  <textarea
                    rows="4"
                    placeholder="Describe specific identifiable details proving this item belongs to you (e.g. distinctive markings, contents inside, lock screen wallpaper, scratches, purchase details, serial numbers)..."
                    value={claimExplanation}
                    onChange={(e) => setClaimExplanation(e.target.value)}
                    required
                  />

                  <div className="claim-claimant-info">
                    <span>Claiming as: <strong>{currentUser?.email}</strong></span>
                  </div>

                  {claimError && (
                    <div className="claim-error-box">
                      ⚠️ {claimError}
                    </div>
                  )}

                  <div className="claim-actions">
                    <button
                      type="submit"
                      className="submit-btn"
                      disabled={claimSubmitting}
                    >
                      {claimSubmitting ? 'Submitting Claim...' : 'Submit Claim Request'}
                    </button>
                    <button
                      type="button"
                      className="claim-cancel-btn"
                      onClick={() => {
                        setShowClaimForm(false);
                        setClaimError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div className="modal-item-header">
                  <h2>{selectedItem.icon} {selectedItem.name}</h2>
                  <div className="modal-status-tags">
                    <span className={`status ${selectedItem.type?.toLowerCase() || 'found'}`}>
                      {selectedItem.type || 'Found'}
                    </span>
                    <span className={`status-pill status-${selectedItem.status?.toLowerCase().replace(' ', '-') || 'available'}`}>
                      {selectedItem.status || 'Available'}
                    </span>
                  </div>
                </div>

                <div className="modal-item-info-grid">
                  <p><strong>Category:</strong> {selectedItem.category}</p>
                  <p><strong>Location:</strong> 📍 {selectedItem.location}</p>
                  {selectedItem.reporterName && (
                    <p><strong>Reported by:</strong> {selectedItem.reporterName}</p>
                  )}
                </div>

                <p className="modal-item-desc">
                  <strong>Description:</strong>{' '}
                  {selectedItem.description || 'No description provided.'}
                </p>

                {selectedItem.imageUrl && (
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.name}
                    className="item-photo"
                    style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '10px', marginBottom: '16px' }}
                  />
                )}

                {/* SECTION 1: RECEIVED CLAIMS MANAGEMENT (Only for Reporter or Admin) */}
                {isReporterOrAdmin && selectedItem.type === 'Found' && (
                  <div className="reporter-claims-management">
                    <h3>Incoming Claims on This Item ({receivedClaimsForItem.length})</h3>

                    {loadingItemClaims ? (
                      <p className="loading-claims-text">Loading claims...</p>
                    ) : receivedClaimsForItem.length === 0 ? (
                      <p className="no-claims-text">No student claims submitted yet for this item.</p>
                    ) : (
                      <div className="modal-claims-list">
                        {receivedClaimsForItem.map((claim) => (
                          <div key={claim.id} className="modal-claim-card">
                            <div className="modal-claim-header">
                              <div>
                                <strong>{claim.claimantName || 'Student'}</strong>
                                <span className="claimant-subtext"> ({claim.claimantEmail})</span>
                              </div>
                              <span className={`status-pill status-${claim.status}`}>
                                {claim.status === 'approved' ? '✓ Approved' : claim.status === 'rejected' ? '✕ Rejected' : 'Pending Review'}
                              </span>
                            </div>
                            <p className="modal-claim-proof">"{claim.explanation}"</p>

                            {claim.status === 'pending' && selectedItem.status !== 'Returned' && (
                              <div className="modal-claim-actions">
                                <button
                                  className="admin-btn-approve"
                                  onClick={() => handleModalApproveClaim(claim)}
                                  disabled={claimActionLoading === claim.id}
                                >
                                  {claimActionLoading === claim.id ? 'Processing...' : '✓ Approve & Return'}
                                </button>
                                <button
                                  className="admin-btn-reject"
                                  onClick={() => handleModalRejectClaim(claim)}
                                  disabled={claimActionLoading === claim.id}
                                >
                                  {claimActionLoading === claim.id ? 'Processing...' : '✕ Reject'}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION 2: CLAIM TRIGGER (For Students Claiming a Found Item) */}
                {selectedItem.type === 'Found' && !isReporterOrAdmin && (
                  <div className="claim-section">
                    {!currentUser ? (
                      <div className="claim-auth-prompt">
                        <p>Sign in with your verified student account to claim this item.</p>
                        <button
                          className="submit-btn"
                          onClick={() => {
                            closeItemModal();
                            setShowLogin(true);
                          }}
                        >
                          Login to Claim
                        </button>
                      </div>
                    ) : selectedItem.status === 'Returned' || selectedItem.status === 'Resolved' ? (
                      <div className="claim-already-submitted">
                        <span className="claim-success-tag">✓ Item Returned</span>
                        <p>This item has already been verified and returned to its rightful owner.</p>
                      </div>
                    ) : userClaimOnSelectedItem ? (
                      <div className="claim-already-submitted">
                        <span className="claim-success-tag">
                          {userClaimOnSelectedItem.status === 'approved' ? '🎉 Claim Approved' : userClaimOnSelectedItem.status === 'rejected' ? '❌ Claim Rejected' : '⏳ Claim Pending Review'}
                        </span>
                        <p>
                          {userClaimOnSelectedItem.status === 'approved'
                            ? `Your claim was approved! Contact the finder at ${selectedItem.reporterEmail} to coordinate retrieval.`
                            : `You submitted a claim for this item. Track updates in your Student Dashboard.`}
                        </p>
                      </div>
                    ) : (
                      <button
                        className="submit-btn claim-trigger-btn"
                        onClick={() => {
                          setShowClaimForm(true);
                          setClaimError('');
                        }}
                      >
                        Claim This Item
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <header className="navbar">
        <h2 className="logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ cursor: 'pointer' }}>
          Find<span>It.</span>
        </h2>

        <nav>
          <a href="#home">Home</a>
          <a href="#items">Browse Items</a>
          <a href="#how">How It Works</a>
        </nav>

        {!currentUser ? (
          <div className="nav-guest-actions">
            <button onClick={() => setShowLogin(true)} className="nav-login-btn">
              Login
            </button>
            <button onClick={() => setShowRegister(true)} className="nav-register-btn">
              Create Account
            </button>
          </div>
        ) : (
          <div className="nav-user-actions">
            {/* IN-APP NOTIFICATIONS BELL */}
            <button
              className="nav-notif-btn"
              onClick={() => {
                setShowStudentDashboard(true);
                setStudentDashboardTab('notifications');
                window.location.hash = '#student';
              }}
              title="Notifications"
            >
              🔔
              {unreadNotifsCount > 0 && (
                <span className="nav-notif-badge">{unreadNotifsCount}</span>
              )}
            </button>

            {/* STUDENT DASHBOARD BUTTON */}
            <button
              className="student-nav-btn"
              onClick={() => {
                setShowStudentDashboard(true);
                setStudentDashboardTab('lost');
                window.location.hash = '#student';
              }}
            >
              📋 My Dashboard
            </button>

            {/* ADMIN DASHBOARD BUTTON */}
            {isAdmin && (
              <button
                className="admin-nav-btn"
                onClick={() => {
                  setShowAdminDashboard(true);
                  window.location.hash = '#admin';
                }}
              >
                🛡️ Admin Dashboard
              </button>
            )}

            {/* LOGOUT */}
            <button className="logout-nav-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}

        <button
          className="report-btn"
          onClick={() => openReportForm('Lost')}
        >
          + Report Item
        </button>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="hero" id="home">
          <p className="tagline">YOUR CAMPUS. YOUR COMMUNITY.</p>

          <h1>
            Lost something?<br />
            <span>Let's find it.</span>
          </h1>

          <p className="hero-text">
            A smarter way to reconnect lost belongings with their owners.
            Search, report, and help make our campus a better place.
          </p>

          <div className="search-box">
            <input
              type="text"
              placeholder="Search by item name, location or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button onClick={() => document.getElementById('items')?.scrollIntoView({ behavior: 'smooth' })}>
              Search
            </button>
          </div>

          <div className="hero-actions">
            <button onClick={() => openReportForm('Lost')}>
              I Lost Something
            </button>

            <button onClick={() => openReportForm('Found')}>
              I Found Something
            </button>
          </div>
        </section>

        {/* ITEMS SECTION WITH ENHANCED FILTERS */}
        <section className="items-section" id="items">
          <div className="section-heading">
            <div>
              <p className="tagline">CAMPUS COMMUNITY</p>
              <h2>Recently Reported Items</h2>
            </div>
            <span>{filteredItems.length} items found</span>
          </div>

          {/* ADVANCED FILTER CONTROLS */}
          <div className="advanced-filter-bar">
            {/* Type Filter */}
            <div className="filter-group">
              <label>Report Type</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="All">All Types (Lost & Found)</option>
                <option value="Lost">Lost Items Only</option>
                <option value="Found">Found Items Only</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="filter-group">
              <label>Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="All">All Categories</option>
                <option value="Electronics">Electronics</option>
                <option value="Accessories">Accessories</option>
                <option value="Books">Books</option>
                <option value="Clothing">Clothing</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Availability Status Filter */}
            <div className="filter-group">
              <label>Item Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Available">Available</option>
                <option value="Claim Pending">Claim Pending</option>
                <option value="Returned">Returned</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>

            {/* Location Quick Search */}
            <div className="filter-group">
              <label>Location</label>
              <input
                type="text"
                placeholder="Filter location (e.g. Library)"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              />
            </div>

            {/* Sort Order */}
            <div className="filter-group">
              <label>Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(search || typeFilter !== 'All' || categoryFilter !== 'All' || statusFilter !== 'All' || locationFilter) && (
              <button
                className="btn-clear-filters"
                onClick={() => {
                  setSearch('');
                  setTypeFilter('All');
                  setCategoryFilter('All');
                  setStatusFilter('All');
                  setLocationFilter('');
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>

          {/* ITEMS GRID */}
          <div className="items-grid">
            {loadingItems ? (
              <div className="dash-empty-card" style={{ gridColumn: '1 / -1' }}>
                <div className="admin-spinner"></div>
                <p>Loading items from campus reports...</p>
              </div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <article className="item-card" key={item.id}>
                  <div className="item-icon">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="item-photo"
                      />
                    ) : (
                      item.icon || '📦'
                    )}
                  </div>

                  <div className="item-card-badges">
                    <span className={`status ${(item.type || 'found').toLowerCase()}`}>
                      {item.type || 'Found'}
                    </span>
                    <span className={`status-pill status-${(item.status || 'available').toLowerCase().replace(' ', '-')}`}>
                      {item.status || 'Available'}
                    </span>
                  </div>

                  <h3>{item.name}</h3>
                  <p className="item-category-label">{item.category}</p>
                  <p className="location">📍 {item.location}</p>

                  <button onClick={() => openItemDetails(item)}>
                    View Details →
                  </button>
                </article>
              ))
            ) : (
              <div className="dash-empty-card" style={{ gridColumn: '1 / -1' }}>
                <span className="empty-icon">🔍</span>
                <h3>No Matching Items Found</h3>
                <p>Try clearing your search terms or expanding your filter criteria.</p>
              </div>
            )}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="how-section" id="how">
          <p className="tagline">SIMPLE AND EASY</p>
          <h2>How FindIt Works</h2>

          <div className="steps">
            <div>
              <span>01</span>
              <h3>Report</h3>
              <p>Report an item you lost or found with location and details.</p>
            </div>

            <div>
              <span>02</span>
              <h3>Discover</h3>
              <p>Search real-time campus listings and find matching items.</p>
            </div>

            <div>
              <span>03</span>
              <h3>Verify & Reconnect</h3>
              <p>Submit proof of ownership. Once verified, return the item safely.</p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer>
        <h2 className="logo">Find<span>It.</span></h2>
        <p>Helping campus belongings find their way home.</p>
        <p>© 2026 FindIt. College Lost & Found Platform.</p>
      </footer>
    </div>
  );
}

export default App;
