import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Edit3, 
  Clock, 
  AlertTriangle,
  Check,
  UserPlus,
  Lock,
  Mail,
  User,
  Building2
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { LocationPill } from '@/components/common/LocationPill';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { UserProfile, UserRole, UserAuditLog } from '@/types/inventory';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import { HOSPITAL_LOCATIONS } from '@/data/hospitalLocations';

export const UserManagementView: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const canWriteUsers = hasPermission('users:write');
  const [users, setUsers] = useState<UserProfile[]>(() => authService.getUsers());
  const [auditLogs, setAuditLogs] = useState<UserAuditLog[]>(() => authService.getUserAuditLogs());
  const [activeTab, setActiveTab] = useState<'USERS' | 'AUDIT'>('USERS');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('STOREKEEPER');
  const [editLocationId, setEditLocationId] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editNotes, setEditNotes] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addFullName, setAddFullName] = useState<string>('');
  const [addEmail, setAddEmail] = useState<string>('');
  const [addPassword, setAddPassword] = useState<string>('');
  const [addRole, setAddRole] = useState<UserRole>('STOREKEEPER');
  const [addLocationId, setAddLocationId] = useState<string>('');
  const [addIsActive, setAddIsActive] = useState<boolean>(true);
  const [addNotes, setAddNotes] = useState<string>('');
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({});
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);
  const [createdSummary, setCreatedSummary] = useState<UserProfile | null>(null);

  const openAddModal = () => {
    setAddFullName('');
    setAddEmail('');
    setAddPassword('');
    setAddRole('STOREKEEPER');
    setAddLocationId('');
    setAddIsActive(true);
    setAddNotes('');
    setAddModalError(null);
    setAddFormErrors({});
    setIsCreatingUser(false);
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setAddModalError(null);
    setAddFormErrors({});
  };

  const validateAddForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!addFullName.trim()) {
      errors.fullName = 'Full Name is required.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!addEmail.trim()) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(addEmail.trim())) {
      errors.email = 'Invalid email address.';
    }
    if (!addPassword) {
      errors.password = 'Temporary Password is required.';
    } else if (addPassword.length < 8) {
      errors.password = 'Password does not meet the required requirements: minimum 8 characters required.';
    }
    if (!addRole) {
      errors.role = 'Please select a role.';
    }
    if (addRole === 'DEPARTMENT_USER' && !addLocationId) {
      errors.locationId = 'Please select a department/location for clinical staff.';
    }

    setAddFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!validateAddForm()) {
      return;
    }

    setIsCreatingUser(true);
    setAddModalError(null);

    const res = await authService.adminCreateUser({
      actorId: currentUser.id,
      fullName: addFullName.trim(),
      email: addEmail.trim(),
      password: addPassword,
      role: addRole,
      assignedLocationId: addLocationId || undefined,
      isActive: addIsActive,
      notes: addNotes || 'Staff onboarding via Users admin console',
    });

    setIsCreatingUser(false);

    if (!res.success || !res.user) {
      setAddModalError(res.error || 'Unable to create user. Please try again.');
      return;
    }

    // Refresh users & audit logs
    const freshUsers = authService.getUsers();
    setUsers(freshUsers);
    setAuditLogs(authService.getUserAuditLogs());

    // Record created user for success banner display
    setCreatedSummary(res.user);
    setSuccessNotice(`User created successfully.`);
    closeAddModal();

    // Clear notice after 8 seconds
    setTimeout(() => {
      setSuccessNotice(null);
      setCreatedSummary(null);
    }, 8000);
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditLocationId(user.assignedLocationId || '');
    setEditIsActive(user.isActive);
    setEditNotes('');
    setModalError(null);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !currentUser) return;

    setModalError(null);

    const res = authService.adminUpdateUser({
      actorId: currentUser.id,
      targetUserId: editingUser.id,
      newRole: editRole,
      newLocationId: editLocationId || undefined,
      newIsActive: editIsActive,
      notes: editNotes || 'Standard administrative role adjustment',
    });

    if (!res.success) {
      setModalError(res.error || 'Failed to update user profile.');
      return;
    }

    setUsers(authService.getUsers());
    setAuditLogs(authService.getUserAuditLogs());
    setEditingUser(null);
    setSuccessNotice(`User profile for ${editingUser.fullName} updated and security event logged.`);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const userColumns: Column<UserProfile>[] = [
    {
      header: 'Staff Member & Email',
      accessor: (u) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {u.fullName}
            {u.id === currentUser?.id && (
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 bg-cyan-100 text-cyan-800 rounded">
                You
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
            {u.email}
          </div>
        </div>
      ),
    },
    {
      header: 'Application Role',
      accessor: (u) => {
        const variantMap: Record<UserRole, 'purple' | 'info' | 'neutral' | 'success'> = {
          ADMIN: 'purple',
          INVENTORY_MANAGER: 'info',
          STOREKEEPER: 'neutral',
          DEPARTMENT_USER: 'success',
        };
        return (
          <StatusBadge
            label={u.role}
            variant={variantMap[u.role] || 'neutral'}
            size="sm"
          />
        );
      },
    },
    {
      header: 'Assigned Department / Location',
      accessor: (u) => {
        if (!u.assignedLocationId) {
          return <span className="text-slate-500 font-medium text-xs">All Facilities (Global)</span>;
        }
        const loc = HOSPITAL_LOCATIONS.find(l => l.id === u.assignedLocationId);
        return <LocationPill location={loc} showIcon={false} />;
      },
    },
    {
      header: 'Access Status',
      accessor: (u) => (
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            u.isActive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          {u.isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
          {u.isActive ? 'Active' : 'Deactivated'}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      accessor: (u) => (
        <button
          onClick={() => openEditModal(u)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-cyan-50 hover:text-cyan-800 text-slate-700 text-xs font-semibold transition-colors"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Edit Role
        </button>
      ),
    },
  ];

  const auditColumns: Column<UserAuditLog>[] = [
    {
      header: 'Timestamp',
      accessor: (a) => (
        <span className="font-mono text-slate-600 text-[11px]">
          {new Date(a.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Authorizing Administrator',
      accessor: (a) => (
        <span className="font-bold text-slate-800">{a.performedByName}</span>
      ),
    },
    {
      header: 'Target Staff Member',
      accessor: (a) => (
        <span className="font-semibold text-slate-900">{a.targetUserName}</span>
      ),
    },
    {
      header: 'Security Action',
      accessor: (a) => (
        <StatusBadge
          label={a.action.replace('_', ' ')}
          variant={a.action === 'ROLE_CHANGE' ? 'purple' : a.action === 'STATUS_TOGGLE' ? 'danger' : 'info'}
          size="sm"
        />
      ),
    },
    {
      header: 'Adjustment (Old &rarr; New)',
      accessor: (a) => (
        <div className="font-mono text-xs text-slate-700">
          <span className="line-through text-slate-400">{a.oldValue}</span> &rarr; <strong className="text-cyan-800">{a.newValue}</strong>
        </div>
      ),
    },
    {
      header: 'Audit Notes',
      accessor: (a) => (
        <span className="text-xs text-slate-500 italic">{a.notes || 'Routine administration'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Clinical staff and access management"
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            ADMIN ONLY
          </span>
        }
        actions={
          canWriteUsers && (
            <Button
              variant="primary"
              size="sm"
              icon={<UserPlus className="w-4 h-4" />}
              onClick={openAddModal}
              id="add-user-btn"
            >
              + Add User
            </Button>
          )
        }
      />

      {/* Success Notice with Created User Summary */}
      {createdSummary && (
        <div 
          role="status" 
          aria-live="polite" 
          className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 space-y-2 shadow-2xs"
        >
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>User created successfully.</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-xs border-t border-emerald-200/70">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Name</span>
              <span className="font-semibold text-slate-900">{createdSummary.fullName}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Email</span>
              <span className="font-mono text-slate-800 text-[11px] truncate block">{createdSummary.email}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Role</span>
              <span className="font-semibold text-slate-900">{createdSummary.role}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Assigned Location</span>
              <span className="text-slate-800 truncate block">
                {createdSummary.assignedLocationId 
                  ? HOSPITAL_LOCATIONS.find(l => l.id === createdSummary.assignedLocationId)?.name || createdSummary.assignedLocationId
                  : 'Global / Central Warehouse'}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Status</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <UserCheck className="w-3 h-3" /> {createdSummary.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      )}

      {successNotice && !createdSummary && (
        <div role="status" aria-live="polite" className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          {successNotice}
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Staff management views" className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'USERS'}
          onClick={() => setActiveTab('USERS')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'USERS'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Hospital Staff Directory ({users.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'AUDIT'}
          onClick={() => setActiveTab('AUDIT')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'AUDIT'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Security Audit Trail ({auditLogs.length})
        </button>
      </div>

      {activeTab === 'USERS' ? (
        <DataTable
          data={users}
          columns={userColumns}
          keyExtractor={u => u.id}
          tableLabel="Hospital Staff Directory"
          searchPlaceholder="Search staff by name, email, or role..."
          searchFilter={(u, q) =>
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.role.toLowerCase().includes(q)
          }
        />
      ) : (
        <DataTable
          data={auditLogs}
          columns={auditColumns}
          keyExtractor={a => a.id}
          tableLabel="Security Audit Trail"
          searchPlaceholder="Search audit records by staff or administrator..."
          searchFilter={(a, q) =>
            a.performedByName.toLowerCase().includes(q) ||
            a.targetUserName.toLowerCase().includes(q) ||
            a.action.toLowerCase().includes(q)
          }
        />
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <Modal
          isOpen={Boolean(editingUser)}
          onClose={() => setEditingUser(null)}
          title={`Edit Permissions: ${editingUser.fullName}`}
          subtitle={`Account Email: ${editingUser.email}`}
          maxWidth="md"
        >
          {modalError && (
            <div id="user-edit-error" role="alert" className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
            <div>
              <label htmlFor="edit-user-role" className="font-bold text-slate-700 block mb-1">Application Role</label>
              <select
                id="edit-user-role"
                value={editRole}
                onChange={e => setEditRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              >
                <option value="ADMIN">ADMIN (Full Hospital Access &amp; User Management)</option>
                <option value="INVENTORY_MANAGER">INVENTORY_MANAGER (Products, Batches, Adjustments)</option>
                <option value="STOREKEEPER">STOREKEEPER (Stock Receipts, Transfers &amp; Wastage)</option>
                <option value="DEPARTMENT_USER">DEPARTMENT_USER (Restricted Clinical Scope)</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-user-location" className="font-bold text-slate-700 block mb-1">
                Authorized Department / Location Scope
              </label>
              <select
                id="edit-user-location"
                value={editLocationId}
                onChange={e => setEditLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              >
                <option value="">Global / Central Warehouse (Admin &amp; Managers)</option>
                {HOSPITAL_LOCATIONS.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} &bull; {loc.name} {!loc.isActive ? '(Inactive)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                DEPARTMENT_USERs will be strictly isolated to this designated facility location.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <label htmlFor="edit-user-active" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="edit-user-active"
                  type="checkbox"
                  checked={editIsActive}
                  onChange={e => setEditIsActive(e.target.checked)}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <span className="font-bold text-slate-800">Account Active (Authorized to Sign In)</span>
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5 ml-5">
                Deactivating immediately invalidates user sessions and blocks inventory movements.
              </p>
            </div>

            <div>
              <label htmlFor="edit-user-notes" className="font-bold text-slate-700 block mb-1">
                Audit Justification Rationale (Mandatory)
              </label>
              <input
                id="edit-user-notes"
                type="text"
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                required
                placeholder="Reason for role change or location reassignment..."
                aria-invalid={Boolean(modalError)}
                aria-describedby={modalError ? 'user-edit-error' : undefined}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold transition-colors shadow-xs"
              >
                Save &amp; Record Audit Log
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ADD USER MODAL */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={closeAddModal}
          title="Add New User"
          subtitle="Create a staff account and assign their MEDiTRACK access."
          maxWidth="md"
        >
          {addModalError && (
            <div id="user-add-error" role="alert" className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{addModalError}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
            {/* Full Name */}
            <div>
              <label htmlFor="add-user-name" className="font-bold text-slate-700 block mb-1">
                Full Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-3.5 h-3.5" />
                </div>
                <input
                  id="add-user-name"
                  type="text"
                  required
                  value={addFullName}
                  onChange={e => {
                    setAddFullName(e.target.value);
                    if (addFormErrors.fullName) {
                      setAddFormErrors(prev => ({ ...prev, fullName: '' }));
                    }
                  }}
                  placeholder="e.g. Dr. Arthur Vance"
                  aria-invalid={Boolean(addFormErrors.fullName)}
                  aria-describedby={addFormErrors.fullName ? 'add-name-error' : undefined}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-xs font-medium focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white ${
                    addFormErrors.fullName ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300'
                  }`}
                />
              </div>
              {addFormErrors.fullName && (
                <p id="add-name-error" className="text-[11px] text-rose-600 mt-1">{addFormErrors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="add-user-email" className="font-bold text-slate-700 block mb-1">
                Email *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <input
                  id="add-user-email"
                  type="email"
                  required
                  value={addEmail}
                  onChange={e => {
                    setAddEmail(e.target.value);
                    if (addFormErrors.email) {
                      setAddFormErrors(prev => ({ ...prev, email: '' }));
                    }
                  }}
                  placeholder="name@stjude.org"
                  aria-invalid={Boolean(addFormErrors.email)}
                  aria-describedby={addFormErrors.email ? 'add-email-error' : undefined}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-xs font-medium focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white ${
                    addFormErrors.email ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300'
                  }`}
                />
              </div>
              {addFormErrors.email && (
                <p id="add-email-error" className="text-[11px] text-rose-600 mt-1">{addFormErrors.email}</p>
              )}
            </div>

            {/* Temporary Password */}
            <div>
              <label htmlFor="add-user-password" className="font-bold text-slate-700 block mb-1">
                Temporary Password *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <input
                  id="add-user-password"
                  type="password"
                  required
                  value={addPassword}
                  onChange={e => {
                    setAddPassword(e.target.value);
                    if (addFormErrors.password) {
                      setAddFormErrors(prev => ({ ...prev, password: '' }));
                    }
                  }}
                  placeholder="Min. 8 characters"
                  aria-invalid={Boolean(addFormErrors.password)}
                  aria-describedby={addFormErrors.password ? 'add-pass-error' : 'add-pass-hint'}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-xs font-medium focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white ${
                    addFormErrors.password ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300'
                  }`}
                />
              </div>
              {addFormErrors.password ? (
                <p id="add-pass-error" className="text-[11px] text-rose-600 mt-1">{addFormErrors.password}</p>
              ) : (
                <p id="add-pass-hint" className="text-[11px] text-slate-400 mt-1">Managed securely via authentication architecture. Never stored in plaintext application tables.</p>
              )}
            </div>

            {/* Role Options */}
            <div>
              <label htmlFor="add-user-role" className="font-bold text-slate-700 block mb-1">
                Role *
              </label>
              <select
                id="add-user-role"
                value={addRole}
                onChange={e => {
                  setAddRole(e.target.value as UserRole);
                  if (addFormErrors.role) {
                    setAddFormErrors(prev => ({ ...prev, role: '' }));
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              >
                <option value="ADMIN">Admin</option>
                <option value="INVENTORY_MANAGER">Inventory Manager</option>
                <option value="STOREKEEPER">Storekeeper</option>
                <option value="DEPARTMENT_USER">Department User</option>
              </select>
            </div>

            {/* Assigned Department / Location */}
            <div>
              <label htmlFor="add-user-location" className="font-bold text-slate-700 block mb-1">
                Assigned Department / Location {addRole === 'DEPARTMENT_USER' && <span className="text-rose-600">*</span>}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <select
                  id="add-user-location"
                  value={addLocationId}
                  onChange={e => {
                    setAddLocationId(e.target.value);
                    if (addFormErrors.locationId) {
                      setAddFormErrors(prev => ({ ...prev, locationId: '' }));
                    }
                  }}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white ${
                    addFormErrors.locationId ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300'
                  }`}
                >
                  <option value="">Global / Central Warehouse (Admin &amp; Managers)</option>
                  {HOSPITAL_LOCATIONS.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code}) {!loc.isActive ? '- Inactive' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {addFormErrors.locationId ? (
                <p className="text-[11px] text-rose-600 mt-1">{addFormErrors.locationId}</p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1">
                  Department Users are strictly scoped to their assigned clinical department.
                </p>
              )}
            </div>

            {/* Active Status */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <label htmlFor="add-user-active" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="add-user-active"
                  type="checkbox"
                  checked={addIsActive}
                  onChange={e => setAddIsActive(e.target.checked)}
                  className="rounded text-cyan-600 focus:ring-cyan-500"
                />
                <span className="font-bold text-slate-800">Active Status</span>
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5 ml-5">
                Enabled staff accounts can immediately sign in.
              </p>
            </div>

            {/* Onboarding Notes */}
            <div>
              <label htmlFor="add-user-notes" className="font-bold text-slate-700 block mb-1">
                Onboarding Notes (Optional)
              </label>
              <input
                id="add-user-notes"
                type="text"
                value={addNotes}
                onChange={e => setAddNotes(e.target.value)}
                placeholder="Reason or department assignment notes..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600 bg-white"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={closeAddModal}
                disabled={isCreatingUser}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isCreatingUser}
                isLoading={isCreatingUser}
                id="submit-create-user-btn"
              >
                {isCreatingUser ? 'Creating User...' : 'Create User'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
