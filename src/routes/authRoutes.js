const express = require('express');
const {
  handleForgotPassword,
  handleLogin,
  handleLogout,
  handleMe,
  handleResetPassword,
  handleValidateResetPasswordToken,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

function createAuthRouter() {
  const router = express.Router();

  router.post('/auth/login', handleLogin);
  router.post('/auth/logout', handleLogout);
  router.get('/auth/me', requireAuth, handleMe);
  router.post('/auth/forgot-password', handleForgotPassword);
  router.get('/auth/reset-password/:token', handleValidateResetPasswordToken);
  router.post('/auth/reset-password', handleResetPassword);

  return router;
}

module.exports = {
  createAuthRouter,
};
