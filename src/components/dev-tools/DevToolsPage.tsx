"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: number;
}

interface CurrentUser {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string;
  isAdmin: boolean;
}

export function DevToolsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  // Get current user info
  const { data: userInfo, refetch: refetchUser } = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation();

  useEffect(() => {
    setCurrentUser(userInfo || null);
  }, [userInfo]);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Fetch admin email from environment
  const fetchAdminEmail = useCallback(async () => {
    try {
      const response = await fetch("/api/dev/config");
      if (response.ok) {
        const data = await response.json();
        setAdminEmail(data.adminEmail);
      }
    } catch (error) {
      console.error("Failed to fetch admin email:", error);
    }
  }, []);

  // Fetch all users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/dev/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      showMessage("error", "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    fetchAdminEmail();
    fetchUsers();
  }, [fetchAdminEmail, fetchUsers]);

  // Switch to user
  const switchToUser = async (email: string) => {
    try {
      setLoading(true);
      const response = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage("success", `Switched to ${email}`);
        await refetchUser();
        window.location.reload();
      } else {
        showMessage("error", data.error || "Failed to switch user");
      }
    } catch (error) {
      console.error("Failed to switch user:", error);
      showMessage("error", "Failed to switch user");
    } finally {
      setLoading(false);
    }
  };

  // Create admin account
  const createAdminAccount = async () => {
    if (!adminEmail) {
      showMessage("error", "Admin email not configured");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/dev/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, nickname: "Admin" }),
      });

      const data = await response.json();
      if (data.success) {
        showMessage("success", `Created and logged in as ${adminEmail}`);
        await refetchUser();
        await fetchUsers();
        window.location.reload();
      } else {
        showMessage("error", data.error || "Failed to create admin account");
      }
    } catch (error) {
      console.error("Failed to create admin account:", error);
      showMessage("error", "Failed to create admin account");
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      setLoading(true);
      await logout.mutateAsync();
      showMessage("success", "Logged out successfully");
      setCurrentUser(null);
      window.location.reload();
    } catch (error) {
      console.error("Failed to logout:", error);
      showMessage("error", "Failed to logout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary mb-2">🛠️ Developer Tools</h1>
          <p className="text-base-content/70">Development & Test Environment Only</p>
          <div className="badge badge-warning mt-2">
            ENV: {process.env.NODE_ENV || "development"}
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}>
            <span>{message.text}</span>
          </div>
        )}

        {/* Current Session Status */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">
              <span className="text-2xl">👤</span>
              Current Session Status
            </h2>
            {currentUser ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">User ID:</span>
                    <code className="bg-base-200 px-2 py-1 rounded text-sm">{currentUser.id}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Email:</span>
                    <span>{currentUser.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Nickname:</span>
                    <span>{currentUser.nickname}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Admin:</span>
                    <div
                      className={`badge ${currentUser.isAdmin ? "badge-primary" : "badge-ghost"}`}
                    >
                      {currentUser.isAdmin ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Avatar:</span>
                    <div className="avatar">
                      <div className="w-8 h-8 rounded-full">
                        <Image src={currentUser.avatarUrl} alt="Avatar" width={32} height={32} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <span className="text-base-content/70">Not logged in</span>
              </div>
            )}
            <div className="card-actions justify-end">
              {currentUser && (
                <button
                  type="button"
                  className="btn btn-outline btn-error"
                  onClick={handleLogout}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    "Logout"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Admin Account */}
        {adminEmail && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">
                <span className="text-2xl">👑</span>
                Admin Account
              </h2>
              <p className="text-base-content/70">Create/login with configured admin account</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Admin Email:</span>
                  <code className="bg-base-200 px-2 py-1 rounded text-sm">{adminEmail}</code>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={createAdminAccount}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    "Create/Login as Admin"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User List & Switching */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex justify-between items-center">
              <h2 className="card-title">
                <span className="text-2xl">👥</span>
                All Users ({users.length})
              </h2>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={fetchUsers}
                disabled={loading}
              >
                {loading ? <span className="loading loading-spinner loading-sm"></span> : "Refresh"}
              </button>
            </div>

            {users.length === 0 ? (
              <div className="text-center py-8">
                <span className="text-base-content/70">No users found</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Nickname</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className={currentUser?.id === user.id ? "bg-primary/10" : ""}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <span>{user.email}</span>
                            {currentUser?.id === user.id && (
                              <div className="badge badge-primary badge-sm">Current</div>
                            )}
                          </div>
                        </td>
                        <td>{user.name || "—"}</td>
                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => switchToUser(user.email)}
                            disabled={loading || currentUser?.id === user.id}
                          >
                            {currentUser?.id === user.id ? "Current" : "Switch"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
