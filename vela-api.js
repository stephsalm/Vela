// ─────────────────────────────────────────
// VELA — Frontend API Connector
// Include this file in every HTML page:
// <script src="vela-api.js"></script>
//
// Then use:
// const trips = await VelaAPI.trips.list()
// const user  = await VelaAPI.auth.me()
// ─────────────────────────────────────────

const VELA_API_BASE = 'http://localhost:3001/api';

// ─── TOKEN MANAGEMENT ───
const VelaAuth = {
  getToken: () => localStorage.getItem('vela_token'),
  getUser:  () => JSON.parse(localStorage.getItem('vela_user') || 'null'),
  isLoggedIn: () => !!localStorage.getItem('vela_token'),
  
  saveAuth(token, user) {
    localStorage.setItem('vela_token', token);
    localStorage.setItem('vela_user', JSON.stringify(user));
  },
  
  clearAuth() {
    localStorage.removeItem('vela_token');
    localStorage.removeItem('vela_user');
  },

  // Redirect to login if not authenticated
  requireAuth(redirectBack = true) {
    if (!this.isLoggedIn()) {
      const current = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = redirectBack
        ? `vela-auth.html?redirect=${current}`
        : 'vela-auth.html';
      return false;
    }
    return true;
  }
};

// ─── BASE FETCH ───
async function velaFetch(path, options = {}) {
  const token = VelaAuth.getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`${VELA_API_BASE}${path}`, {
      ...options,
      headers
    });

    // Handle 401 — token expired
    if (res.status === 401) {
      VelaAuth.clearAuth();
      window.location.href = 'vela-auth.html';
      return null;
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }

    return data;

  } catch (err) {
    if (err.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to Vela server. Make sure the backend is running on localhost:3001');
    }
    throw err;
  }
}

// ─── API METHODS ───
const VelaAPI = {

  // ── AUTH ──
  auth: {
    async login(email, password) {
      return velaFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
    },

    async signup(name, email, password) {
      return velaFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
    },

    async me() {
      return velaFetch('/auth/me');
    },

    async forgotPassword(email) {
      return velaFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },

    signOut() {
      VelaAuth.clearAuth();
      window.location.href = 'vela-auth.html';
    }
  },

  // ── TRIPS ──
  trips: {
    async list(status = null) {
      const params = status ? `?status=${status}` : '';
      return velaFetch(`/trips${params}`);
    },

    async get(id) {
      return velaFetch(`/trips/${id}`);
    },

    async create(tripData) {
      return velaFetch('/trips', {
        method: 'POST',
        body: JSON.stringify(tripData)
      });
    },

    async update(id, updates) {
      return velaFetch(`/trips/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    },

    async delete(id) {
      return velaFetch(`/trips/${id}`, {
        method: 'DELETE'
      });
    },

    async confirm(id) {
      return velaFetch(`/trips/${id}/confirm`, {
        method: 'POST'
      });
    }
  },

  // ── AI ──
  ai: {
    // Returns an EventSource for streaming
    generateStream(tripData) {
      return new Promise((resolve, reject) => {
        fetch(`${VELA_API_BASE}/ai/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${VelaAuth.getToken()}`
          },
          body: JSON.stringify(tripData)
        }).then(res => {
          if (!res.ok) return reject(new Error('AI generation failed'));
          resolve(res.body.getReader());
        }).catch(reject);
      });
    },

    async refine(originalItinerary, refinementRequest, tripId = null) {
      return velaFetch('/ai/refine', {
        method: 'POST',
        body: JSON.stringify({ originalItinerary, refinementRequest, tripId })
      });
    },

    async ask(question, tripContext = null) {
      return velaFetch('/ai/question', {
        method: 'POST',
        body: JSON.stringify({ question, tripContext })
      });
    }
  },

  // ── USERS ──
  users: {
    async getProfile() {
      return velaFetch('/users/profile');
    },

    async updateProfile(name) {
      return velaFetch('/users/profile', {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
    },

    async updatePreferences(prefs) {
      return velaFetch('/users/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs)
      });
    },

    async getVault() {
      return velaFetch('/users/vault');
    },

    async addVaultItem(item) {
      return velaFetch('/users/vault', {
        method: 'POST',
        body: JSON.stringify(item)
      });
    },

    async deleteVaultItem(id) {
      return velaFetch(`/users/vault/${id}`, {
        method: 'DELETE'
      });
    }
  },

  // ── STRIPE ──
  stripe: {
    async createCheckout(tier) {
      const data = await velaFetch('/stripe/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ tier })
      });
      // Redirect to Stripe checkout
      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
      return data;
    },

    async openPortal() {
      const data = await velaFetch('/stripe/portal', {
        method: 'POST'
      });
      if (data?.portalUrl) {
        window.location.href = data.portalUrl;
      }
      return data;
    },

    async getSubscription() {
      return velaFetch('/stripe/subscription');
    }
  }
};

// ─── HELPER: Update nav based on auth state ───
function velaUpdateNav() {
  const user = VelaAuth.getUser();
  const isLoggedIn = VelaAuth.isLoggedIn();

  // Update any nav elements that show login/account state
  const navAuthBtns = document.querySelectorAll('[data-vela-auth]');
  navAuthBtns.forEach(el => {
    const showWhen = el.dataset.velaAuth;
    if (showWhen === 'loggedIn') el.style.display = isLoggedIn ? '' : 'none';
    if (showWhen === 'loggedOut') el.style.display = isLoggedIn ? 'none' : '';
  });

  // Update username displays
  document.querySelectorAll('[data-vela-username]').forEach(el => {
    if (user) el.textContent = user.name?.split(' ')[0] || 'Account';
  });

  // Update tier displays
  document.querySelectorAll('[data-vela-tier]').forEach(el => {
    if (user) el.textContent = user.tier || 'explorer';
  });
}

// Run on every page load
document.addEventListener('DOMContentLoaded', velaUpdateNav);

// ─── EXPORT (for use in other scripts) ───
window.VelaAPI  = VelaAPI;
window.VelaAuth = VelaAuth;
