import express from 'express';

export const authRouter = express.Router();

/**
 * Authentication & Supermarket Account Integration Scaffolding
 *
 * ⚠️ CAUTION / WARNING:
 * ENABLE_AUTH is disabled by default (false).
 * Flipping ENABLE_AUTH=true activates scaffolded FAKE authentication (mock JWTs and stub users)
 * for testing and UI integration only. It is NOT real authentication and does not store credentials securely.
 * See TODO.md for future production milestones (OAuth 2.0 / Vault / Supermarket Direct Connect).
 */
const ENABLE_AUTH = process.env.ENABLE_AUTH === 'true';

// Middleware to guard all auth endpoints
function requireAuthFeature(req, res, next) {
  if (!ENABLE_AUTH) {
    return res.status(503).json({
      success: false,
      enabled: false,
      error: 'Authentication & Supermarket Account Linking is currently scaffolded and disabled (ENABLE_AUTH=false).',
      documentation: 'See TODO.md for future milestones: direct supermarket account linking, basket export, and credential management.'
    });
  }
  next();
}

authRouter.use(requireAuthFeature);

/**
 * POST /api/auth/register
 * Stub for new user registration
 */
authRouter.post('/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  res.status(201).json({
    success: true,
    user: { id: 'usr-stub-123', email, name: email.split('@')[0] },
    message: 'User registered (scaffolded)'
  });
});

/**
 * POST /api/auth/login
 * Stub for user login
 */
authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  res.json({
    success: true,
    token: 'jwt-scaffolded-token-sample',
    user: { id: 'usr-stub-123', email, name: email.split('@')[0] }
  });
});

/**
 * POST /api/auth/logout
 * Stub for session termination
 */
authRouter.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Stub for current user session
 */
authRouter.get('/me', (req, res) => {
  res.json({
    authenticated: true,
    user: { id: 'usr-stub-123', email: 'user@shoppingwise.co.uk', name: 'Shopper' }
  });
});

/**
 * POST /api/auth/supermarket-connect/:store
 * Stub for connecting Tesco, Sainsbury's, Asda, or Morrisons accounts
 */
authRouter.post('/supermarket-connect/:store', (req, res) => {
  const { store } = req.params;
  const { credentials: _credentials } = req.body || {};
  res.json({
    success: true,
    store,
    connected: true,
    message: `Account connected for ${store.toUpperCase()} (scaffolded)`
  });
});

/**
 * GET /api/auth/supermarket-status
 * Stub to list connected supermarket accounts
 */
authRouter.get('/supermarket-status', (req, res) => {
  res.json({
    connectedStores: [],
    availableStores: ['tesco', 'sainsburys', 'asda', 'morrisons', 'iceland']
  });
});
