"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/permissions";
import { userDb, roleDb } from "@/lib/db/database";
import type { User as DbUser, Role } from "@/types";

export default function UsersManagementPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    // Check if user is doctor (admin role in this system)
    if (user.role !== 'doctor') {
      router.push('/');
      return;
    }
    setIsAuthorized(true);
  }, [router]);
  
  const [users, setUsers] = useState<DbUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<DbUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
    name: '',
    email: '',
    roleId: '',
    customPermissions: [] as string[],
    securityQuestion: '',
    securityAnswer: '',
  });

  // Available modules for permission selection
  const availableModules = [
    { id: 'patients', name: 'Patients', icon: '👥' },
    { id: 'appointments', name: 'Appointments', icon: '📅' },
    { id: 'queue', name: 'Queue', icon: '📋' },
    { id: 'doctor-panel', name: 'Doctor Panel', icon: '🩺' },
    { id: 'pharmacy', name: 'Pharmacy', icon: '💊' },
    { id: 'prescriptions', name: 'Prescriptions', icon: '📋' },
    { id: 'billing', name: 'Billing', icon: '💰' },
    { id: 'reports', name: 'Reports', icon: '📊' },
    { id: 'materia-medica', name: 'Materia Medica', icon: '📚' },
    { id: 'settings', name: 'Settings', icon: '⚙️' },
    { id: 'admin', name: 'Admin', icon: '👨‍💼' },
  ];

  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
      loadRoles();
    }
  }, [isAuthorized]);

  const loadUsers = () => {
    const allUsers = userDb.getAll() as DbUser[];
    
    // Deduplicate users by ID - keep only the first occurrence
    const seenIds = new Set<string>();
    const uniqueUsers = allUsers.filter(user => {
      if (seenIds.has(user.id)) {
        console.warn(`[Admin] Duplicate user ID detected: ${user.id}, removing duplicate`);
        return false;
      }
      seenIds.add(user.id);
      return true;
    });
    
    setUsers(uniqueUsers);
  };

  const loadRoles = () => {
    const allRoles = roleDb.getAll() as Role[];
    
    // Deduplicate roles by ID - keep only the first occurrence
    const seenIds = new Set<string>();
    const uniqueRoles = allRoles.filter(role => {
      if (seenIds.has(role.id)) {
        console.warn(`[Admin] Duplicate role ID detected: ${role.id}, removing duplicate`);
        return false;
      }
      seenIds.add(role.id);
      return true;
    });
    
    setRoles(uniqueRoles);
  };

  const handleCreate = () => {
    setEditingUser(null);
    setShowForm(true);
    const receptionistRole = roles.find(r => r.name === 'Receptionist');
    const rolePermissions = receptionistRole ? Object.keys(receptionistRole.permissions || {}) : [];
    setFormData({
      identifier: '',
      password: '',
      name: '',
      email: '',
      roleId: receptionistRole?.id || '',
      customPermissions: rolePermissions,
      securityQuestion: '',
      securityAnswer: '',
    });
  };

  const handleEdit = (user: DbUser) => {
    setEditingUser(user);
    setShowForm(true);
    const role = roles.find(r => r.id === user.roleId);
    const rolePermissions = role ? Object.keys(role.permissions || {}) : [];
    const userPermissions = user.customPermissions || rolePermissions;
    const userWithSecurity = user as DbUser & { securityQuestion?: string; securityAnswer?: string };
    setFormData({
      identifier: user.identifier,
      password: user.password || '',
      name: user.name,
      email: user.email || '',
      roleId: user.roleId,
      customPermissions: userPermissions,
      securityQuestion: userWithSecurity.securityQuestion || '',
      securityAnswer: userWithSecurity.securityAnswer || '',
    });
  };

  const handleSave = () => {
    if (!formData.identifier.trim() || !formData.name.trim() || !formData.password.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    console.log('Saving user with data:', formData);

    if (editingUser) {
      const updateData = {
        identifier: formData.identifier,
        username: formData.identifier,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        roleId: formData.roleId,
        customPermissions: formData.customPermissions,
        securityQuestion: formData.securityQuestion || undefined,
        securityAnswer: formData.securityAnswer || undefined,
      };
      console.log('Updating user:', editingUser.id, updateData);
      userDb.update(editingUser.id, updateData);
    } else {
      const newUser = {
        identifier: formData.identifier,
        username: formData.identifier,
        identifierType: 'username' as const,
        password: formData.password,
        name: formData.name,
        email: formData.email,
        roleId: formData.roleId,
        isActive: true,
        isDoctor: false,
        customPermissions: formData.customPermissions,
        securityQuestion: formData.securityQuestion || undefined,
        securityAnswer: formData.securityAnswer || undefined,
      };
      console.log('Creating new user:', newUser);
      const created = userDb.create(newUser as unknown as Parameters<typeof userDb.create>[0]);
      console.log('User created:', created);
    }

    setShowForm(false);
    setEditingUser(null);
    loadUsers();
    
    console.log('All users after save:', userDb.getAll());
  };

  const handleDelete = (userId: string) => {
    // Prevent deleting the main doctor user
    const user = users.find(u => u.id === userId);
    if (user && user.identifier === 'doctor') {
      alert('Cannot delete the main doctor user');
      return;
    }
    
    if (confirm(`Are you sure you want to delete user "${user?.name}"? This action cannot be undone.`)) {
      try {
        const deleted = userDb.delete(userId);
        if (deleted) {
          // Immediately update the UI by filtering out the deleted user
          setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
          console.log('User deleted successfully:', userId);
        } else {
          alert('Failed to delete user. Please try again.');
        }
      } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Failed to delete user. Please try again.');
      }
    }
  };

  const handleToggleActive = (userId: string) => {
    // Prevent deactivating the main doctor user
    const user = users.find(u => u.id === userId);
    if (user && user.identifier === 'doctor' && user.isActive) {
      alert('Cannot deactivate the main doctor user');
      return;
    }
    
    if (user) {
      const newStatus = !user.isActive;
      userDb.update(userId, { isActive: newStatus });
      // Immediately update the UI
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === userId ? { ...u, isActive: newStatus } : u
        )
      );
      console.log('User status updated:', userId, 'isActive:', newStatus);
    }
  };

  const handleResetPassword = (userId: string) => {
    setResetPasswordUserId(userId);
    setNewPassword('');
    setShowNewPassword(false);
    setShowResetPasswordModal(true);
  };

  const handleConfirmResetPassword = () => {
    if (!newPassword.trim()) {
      alert('Please enter a new password');
      return;
    }

    if (resetPasswordUserId) {
      userDb.update(resetPasswordUserId, { password: newPassword });
      const user = users.find(u => u.id === resetPasswordUserId);
      alert(`Password reset successfully for user "${user?.name}"`);
      setShowResetPasswordModal(false);
      setResetPasswordUserId(null);
      setNewPassword('');
    }
  };

  const getRoleName = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    return role?.name || 'Unknown';
  };

  const getPermissionCount = (user: DbUser) => {
    // If user has custom permissions, count only valid modules from availableModules
    if (user.customPermissions && user.customPermissions.length > 0) {
      const validModuleIds = availableModules.map(m => m.id);
      const validPermissions = user.customPermissions.filter(p => validModuleIds.includes(p));
      return validPermissions.length;
    }
    
    // Otherwise, get from role - show all role permissions as-is
    const role = roles.find(r => r.id === user.roleId);
    if (role && role.permissions) {
      return Object.keys(role.permissions).length;
    }
    
    return 0;
  };

  const togglePermission = (moduleId: string) => {
    const currentPermissions = formData.customPermissions || [];
    if (currentPermissions.includes(moduleId)) {
      setFormData({
        ...formData,
        customPermissions: currentPermissions.filter(p => p !== moduleId),
      });
    } else {
      setFormData({
        ...formData,
        customPermissions: [...currentPermissions, moduleId],
      });
    }
  };

  const handleRoleChange = (newRoleId: string) => {
    const role = roles.find(r => r.id === newRoleId);
    const rolePermissions = role ? Object.keys(role.permissions || {}) : [];
    setFormData({
      ...formData,
      roleId: newRoleId,
      customPermissions: rolePermissions, // Reset to role's default permissions
    });
  };

  // Show loading while checking authorization
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
              <p className="text-sm text-gray-500">Manage system users, roles, and permissions</p>
            </div>
            {!showForm && (
              <Button onClick={handleCreate}>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* User Form */}
          {showForm && (
            <Card className="p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                  <Input
                    value={formData.identifier}
                    onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                    placeholder="username"
                    disabled={editingUser?.identifier === 'doctor'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Security Question (Optional - for password recovery)</label>
                  <Input
                    value={formData.securityQuestion}
                    onChange={(e) => setFormData({ ...formData, securityQuestion: e.target.value })}
                    placeholder="e.g., What is your mother's maiden name?"
                  />
                </div>
                {formData.securityQuestion && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Security Answer</label>
                    <Input
                      value={formData.securityAnswer}
                      onChange={(e) => setFormData({ ...formData, securityAnswer: e.target.value })}
                      placeholder="Enter the answer to your security question"
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    value={formData.roleId}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    disabled={editingUser?.identifier === 'doctor'}
                  >
                    <option value="">Select a role</option>
                    {roles.map((role, index) => (
                      <option key={`${role.id}-${index}`} value={role.id}>
                        {role.name} ({Object.keys(role.permissions || {}).length} permissions)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Permissions Section */}
              <div className="mt-6 border-t pt-4">
                <h3 className="text-md font-semibold text-gray-900 mb-3">Module Permissions</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Select which modules this user can access. {editingUser ? 'Changes here override the role defaults.' : 'These will be set based on the selected role.'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {availableModules.map((module) => (
                    <label
                      key={module.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.customPermissions?.includes(module.id) || false}
                        onChange={() => togglePermission(module.id)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        disabled={editingUser?.identifier === 'doctor'}
                      />
                      <span className="text-xl">{module.icon}</span>
                      <span className="text-sm font-medium text-gray-700">{module.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave}>{editingUser ? 'Update' : 'Create'} User</Button>
                <Button variant="secondary" onClick={() => {
                  setShowForm(false);
                  setEditingUser(null);
                }}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          {/* Users List */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">System Users</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-left py-3 px-2">Username</th>
                    <th className="text-left py-3 px-2">Role</th>
                    <th className="text-left py-3 px-2">Permissions</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          {user.name}
                          {user.identifier === 'doctor' && (
                            <Badge variant="default" size="sm">Main Admin</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono text-sm">{user.identifier}</td>
                      <td className="py-3 px-2">
                        <Badge variant={getRoleName(user.roleId) === 'Doctor' ? 'default' : 'outline'}>
                          {getRoleName(user.roleId)}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">{getPermissionCount(user)} modules</span>
                          {user.customPermissions && user.customPermissions.length > 0 && (
                            <Badge variant="outline" size="sm">Custom</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={user.isActive ? 'success' : 'default'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handleEdit(user)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleResetPassword(user.id)}
                          >
                            Reset Password
                          </Button>
                          {user.identifier !== 'doctor' && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleToggleActive(user.id)}
                              >
                                {user.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDelete(user.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                Delete
                              </Button>
                            </>
                          )}
                          {user.identifier === 'doctor' && (
                            <span className="text-sm text-gray-500 italic px-2">Main user</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Reset Password</h2>
            <p className="text-sm text-gray-600 mb-4">
              Enter a new password for user: {users.find(u => u.id === resetPasswordUserId)?.name}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNewPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmResetPassword}>Reset Password</Button>
              <Button variant="secondary" onClick={() => {
                setShowResetPasswordModal(false);
                setResetPasswordUserId(null);
                setNewPassword('');
              }}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
