const express = require('express');
const {
  handleCreateAdminUser,
  handleListAdminUsers,
  handleResetAdminUserPassword,
  handleUpdateAdminUser,
  handleUpdateAdminUserStatus,
} = require('../controllers/adminUsersController');
const { ACCESS_PERMISSIONS, requirePermission } = require('../middleware/authMiddleware');

function createAdminUsersRouter() {
  const router = express.Router();

  router.get('/admin/usuarios', requirePermission(ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW), handleListAdminUsers);
  router.post('/admin/usuarios', requirePermission(ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW), handleCreateAdminUser);
  router.put('/admin/usuarios/:id', requirePermission(ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW), handleUpdateAdminUser);
  router.patch('/admin/usuarios/:id/status', requirePermission(ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW), handleUpdateAdminUserStatus);
  router.post('/admin/usuarios/:id/reset-password', requirePermission(ACCESS_PERMISSIONS.CONFIG_ADMIN_VIEW), handleResetAdminUserPassword);

  return router;
}

module.exports = {
  createAdminUsersRouter,
};
