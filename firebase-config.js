// Firebase Configuration & Unified Database Synchronization Service
// Navratri Dandiya Mahotsav 2.0 - Nalagonda

const firebaseConfig = {
  apiKey: "AIzaSyCvY6kDSBKtjy6gszEGBB0-_xddFKUaPdg",
  authDomain: "nandhi-2960d.firebaseapp.com",
  projectId: "nandhi-2960d",
  storageBucket: "nandhi-2960d.firebasestorage.app",
  messagingSenderId: "510335914890",
  appId: "1:510335914890:web:38cacb5e60ef53bd886e73",
  measurementId: "G-9QPB3X427B"
};

// ── Safe Storage Layer (iOS Safari / Private Browsing compatible) ──
// iOS Safari in Private Browsing throws SecurityError on any localStorage/sessionStorage access.
// This wrapper catches all errors and falls back to an in-memory store so the app keeps working.
const _memStore = {};
const SafeStorage = {
  _isAvailable: null,

  _check: function () {
    if (this._isAvailable !== null) return this._isAvailable;
    try {
      const testKey = '__dandiya_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      this._isAvailable = true;
    } catch (e) {
      this._isAvailable = false;
      console.warn('[SafeStorage] localStorage unavailable (iOS Private Mode?). Using in-memory fallback.');
    }
    return this._isAvailable;
  },

  getItem: function (key) {
    if (this._check()) {
      try { return localStorage.getItem(key); } catch (e) { return _memStore[key] || null; }
    }
    return _memStore[key] !== undefined ? _memStore[key] : null;
  },

  setItem: function (key, value) {
    if (this._check()) {
      try { localStorage.setItem(key, value); } catch (e) { _memStore[key] = value; }
    } else {
      _memStore[key] = value;
    }
  },

  removeItem: function (key) {
    if (this._check()) {
      try { localStorage.removeItem(key); } catch (e) { delete _memStore[key]; }
    } else {
      delete _memStore[key];
    }
  }
};

const _ssMemStore = {};
const SafeSession = {
  _isAvailable: null,

  _check: function () {
    if (this._isAvailable !== null) return this._isAvailable;
    try {
      const testKey = '__dandiya_ss_test__';
      sessionStorage.setItem(testKey, '1');
      sessionStorage.removeItem(testKey);
      this._isAvailable = true;
    } catch (e) {
      this._isAvailable = false;
      console.warn('[SafeSession] sessionStorage unavailable (iOS Private Mode?). Using in-memory fallback.');
    }
    return this._isAvailable;
  },

  getItem: function (key) {
    if (this._check()) {
      try { return sessionStorage.getItem(key); } catch (e) { return _ssMemStore[key] || null; }
    }
    return _ssMemStore[key] !== undefined ? _ssMemStore[key] : null;
  },

  setItem: function (key, value) {
    if (this._check()) {
      try { sessionStorage.setItem(key, value); } catch (e) { _ssMemStore[key] = value; }
    } else {
      _ssMemStore[key] = value;
    }
  },

  removeItem: function (key) {
    if (this._check()) {
      try { sessionStorage.removeItem(key); } catch (e) { delete _ssMemStore[key]; }
    } else {
      delete _ssMemStore[key];
    }
  }
};

// Check if Firebase credentials have been configured
const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let db = null;
let storage = null;

if (typeof firebase !== 'undefined' && isFirebaseConfigured) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    if (firebase.firestore) {
      db = firebase.firestore();
    }
    if (firebase.storage) {
      storage = firebase.storage();
    }
    console.log('[Firebase] Successfully initialized Cloud Firestore & Storage');
  } catch (err) {
    console.warn('[Firebase] Initialization warning, falling back to LocalStorage:', err);
  }
} else {
  console.info('[Firebase] Config placeholder detected. Running on high-performance LocalStorage fallback.');
}

// ── Database Operations Helper ──
const DandiyaDB = {
  // Check if cloud Firebase is currently active
  isCloudActive: () => {
    return db !== null;
  },

  // 1. Save or update a booking / reservation
  saveBooking: async (bookingData) => {
    const docId = bookingData.id || bookingData.reservationId;

    // A. Always save to SafeStorage for instant UI responsiveness & offline/iOS support
    try {
      const local = JSON.parse(SafeStorage.getItem('dandiya_bookings') || '[]');
      const idx = local.findIndex(b => (b.id || b.reservationId) === docId);
      if (idx !== -1) {
        local[idx] = { ...local[idx], ...bookingData };
      } else {
        local.unshift(bookingData);
      }
      SafeStorage.setItem('dandiya_bookings', JSON.stringify(local));
    } catch (e) {
      console.error('SafeStorage write error:', e);
    }

    // B. If Firebase is connected, sync to Firestore collection 'bookings'
    if (db) {
      try {
        await db.collection('bookings').doc(docId).set(bookingData, { merge: true });
        console.log('[Firebase] Synced booking to Firestore:', docId);
      } catch (err) {
        console.error('[Firebase] Firestore save error:', err);
      }
    }
  },

  // 2. Fetch all bookings (Admin View)
  getAllBookings: async () => {
    if (db) {
      try {
        const snap = await db.collection('bookings').orderBy('createdAt', 'desc').get();
        const list = [];
        snap.forEach(doc => list.push(doc.data()));
        return list;
      } catch (err) {
        console.warn('[Firebase] Firestore fetch failed, falling back to SafeStorage:', err);
      }
    }
    // Fallback
    try {
      return JSON.parse(SafeStorage.getItem('dandiya_bookings') || '[]');
    } catch (e) {
      return [];
    }
  },

  // 3. Subscribe to real-time updates for Admin Dashboard
  subscribeToBookings: (callback) => {
    if (db) {
      return db.collection('bookings')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
          const list = [];
          snapshot.forEach(doc => list.push(doc.data()));
          // Mirror to SafeStorage (handles iOS Private Mode gracefully)
          try { SafeStorage.setItem('dandiya_bookings', JSON.stringify(list)); } catch (e) {}
          callback(list);
        }, (err) => {
          console.warn('[Firebase] Realtime listener error, falling back to local:', err);
          try {
            callback(JSON.parse(SafeStorage.getItem('dandiya_bookings') || '[]'));
          } catch (e) {
            callback([]);
          }
        });
    }

    // SafeStorage fallback poll / instant callback
    try {
      callback(JSON.parse(SafeStorage.getItem('dandiya_bookings') || '[]'));
    } catch (e) {
      callback([]);
    }
    return () => {};
  },

  // 4. Update status (e.g., 'Confirmed', 'Rejected', 'Attended')
  updateBookingStatus: async (docId, updates) => {
    // SafeStorage update
    try {
      const local = JSON.parse(SafeStorage.getItem('dandiya_bookings') || '[]');
      const idx = local.findIndex(b => (b.id || b.reservationId) === docId);
      if (idx !== -1) {
        local[idx] = { ...local[idx], ...updates };
        SafeStorage.setItem('dandiya_bookings', JSON.stringify(local));
      }
    } catch (e) {}

    // Firestore update
    if (db) {
      try {
        await db.collection('bookings').doc(docId).update(updates);
        console.log('[Firebase] Status updated in Firestore:', docId, updates);
      } catch (err) {
        console.error('[Firebase] Firestore update error:', err);
      }
    }
  },

  // 5. Delete booking
  deleteBooking: async (docId) => {
    // SafeStorage delete
    try {
      const local = JSON.parse(SafeStorage.getItem('dandiya_bookings') || '[]');
      const filtered = local.filter(b => (b.id || b.reservationId) !== docId);
      SafeStorage.setItem('dandiya_bookings', JSON.stringify(filtered));
    } catch (e) {}

    // Firestore delete
    if (db) {
      try {
        await db.collection('bookings').doc(docId).delete();
        console.log('[Firebase] Deleted doc from Firestore:', docId);
      } catch (err) {
        console.error('[Firebase] Firestore delete error:', err);
      }
    }
  }
};

// Export to window
window.firebaseConfig = firebaseConfig;
window.DandiyaDB = DandiyaDB;
window.SafeStorage = SafeStorage;
window.SafeSession = SafeSession;
