import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContextSimple";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  QrCode,
  Menu,
  LogOut,
  User,
  Bell,
  PlusCircle,
  ArrowRightLeft,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  getInvitationGroupStatusMeta,
  normalizeInvitationGroupStatus,
} from "@/lib/invitationGroupStatus";

type PendingNotification = {
  id: string;
  invitation_id: number;
  group_label: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  type?: "new" | "status_change" | "updated" | "correction";
};

const humanizeStatus = (status?: string) =>
  getInvitationGroupStatusMeta(status || "").label;

const groupLabel = (id: number) => `GRP-${String(id).padStart(4, "0")}`;

const NOTIFICATIONS_KEY = "approver.notifications.v1";
const KNOWN_PENDING_SNAPSHOT_KEY = "approver.known_pending_snapshot.v1";
const APPROVALS_PENDING_COUNT_QUERY_KEY = ["approvals", "pending", "count"] as const;

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const raw = String(value).trim();
  // Backend may return naive UTC timestamps (without timezone), e.g. "2026-02-23 21:15:24".
  // Normalize them to UTC to avoid showing shifted local times.
  const hasExplicitTz = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const normalized = hasExplicitTz
    ? raw
    : raw.includes("T")
      ? `${raw}Z`
      : `${raw.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const inferNotificationType = (
  notif: Pick<PendingNotification, "title" | "message" | "type">
): PendingNotification["type"] => {
  if (notif.type) return notif.type;
  const title = String(notif.title || "").toLowerCase();
  const message = String(notif.message || "").toLowerCase();
  if (title.includes("correccion") || message.includes("correccion")) return "correction";
  if (title.includes("nueva")) return "new";
  if (title.includes("estado") || message.includes("→")) return "status_change";
  return "updated";
};

const participantsSummary = (item: any) => {
  const companions = Array.isArray(item?.companions) ? item.companions : [];
  const total = 1 + companions.length;
  let approved = 0;
  let rejected = 0;
  if (item?.titular_approved === true) approved += 1;
  if (item?.titular_approved === false) rejected += 1;
  companions.forEach((comp: any) => {
    if (comp?.approved === true) approved += 1;
    if (comp?.approved === false) rejected += 1;
  });
  const pending = Math.max(0, total - approved - rejected);
  const completeDocs =
    (item?.titular_selfie_url && item?.titular_doc_url ? 1 : 0) +
    companions.filter((c: any) => c?.selfie_url && c?.doc_url).length;

  return { total, approved, rejected, pending, completeDocs };
};

const buildPendingNotificationContent = (item: any, id: number) => {
  const summary = participantsSummary(item);
  const eventLabel = item.event_name || `Evento ${item.event_id}`;
  const normalizedStatus = normalizeInvitationGroupStatus(String(item?.status || ""));
  const createdAt = String(item?.created_at || "").trim();
  const updatedAt = String(item?.updated_at || "").trim();
  const hasBeenUpdated = Boolean(createdAt && updatedAt && createdAt !== updatedAt);

  if (normalizedStatus === "pendiente de actualizacion") {
    return {
      type: "correction" as const,
      title: `${groupLabel(id)} · Corrección recibida`,
      message: `${eventLabel} · ${summary.completeDocs} de ${summary.total} integrantes con documentos listos para revisión.`,
    };
  }

  if (normalizedStatus === "aprobado parcial") {
    return {
      type: "status_change" as const,
      title: `${groupLabel(id)} · Revisión parcial pendiente`,
      message: `${eventLabel} · ${summary.approved} aprob., ${summary.rejected} rech., ${summary.pending} por decidir.`,
    };
  }

  if (hasBeenUpdated) {
    return {
      type: "updated" as const,
      title: `${groupLabel(id)} · Actualización recibida`,
      message: `${eventLabel} · El registro fue actualizado y requiere revisión.`,
    };
  }

  return {
    type: "new" as const,
    title: `${groupLabel(id)} · Nueva solicitud`,
    message: `${eventLabel} · ${summary.completeDocs} de ${summary.total} integrantes con registro completo.`,
  };
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canWatchApprovals =
    Boolean(user?.is_superuser) ||
    (user?.role || "").toLowerCase() === "approver" ||
    (user?.permissions || []).some((p) =>
      ["approvals.read", "approvals.decide"].includes(p.toLowerCase())
    );

  const pendingQuery = useQuery({
    queryKey: APPROVALS_PENDING_COUNT_QUERY_KEY,
    queryFn: () => api.invitationGroups.pendingApprovals(),
    enabled: Boolean(user) && canWatchApprovals,
    refetchInterval: 15000,
    staleTime: 5000,
  });
  const pendingCount = Array.isArray(pendingQuery.data)
    ? pendingQuery.data.length
    : 0;
  const [notifications, setNotifications] = useState<PendingNotification[]>(() => {
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [notifFilter, setNotifFilter] = useState<
    "all" | "new" | "status_change" | "correction"
  >("all");

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (!canWatchApprovals) return;
    const items = Array.isArray(pendingQuery.data) ? pendingQuery.data : [];
    const currentSnapshot: Record<string, string> = {};
    items.forEach((item: any) => {
      const id = Number(item.id);
      if (!Number.isFinite(id)) return;
      const status = String(item.status || "").trim().toLowerCase();
      const updatedAt = String(item.updated_at || item.created_at || "").trim();
      currentSnapshot[String(id)] = `${status}|${updatedAt}`;
    });

    let knownSnapshot: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(KNOWN_PENDING_SNAPSHOT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      knownSnapshot = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      knownSnapshot = {};
    }

    if (Object.keys(knownSnapshot).length === 0) {
      if (items.length > 0) {
        setNotifications((prev) => {
          const upserted = new Map<number, PendingNotification>(
            prev.map((n) => [n.invitation_id, n])
          );
          items.forEach((item: any) => {
            const id = Number(item.id);
            if (!Number.isFinite(id)) return;
            const content = buildPendingNotificationContent(item, id);
            upserted.set(id, {
              id: upserted.get(id)?.id || `${id}-seed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              invitation_id: id,
              group_label: groupLabel(id),
              title: content.title,
              message: content.message,
              created_at: String(item.updated_at || item.created_at || new Date().toISOString()),
              read: false,
              type: content.type,
            });
          });
          return Array.from(upserted.values())
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 50);
        });
      }
      localStorage.setItem(
        KNOWN_PENDING_SNAPSHOT_KEY,
        JSON.stringify(currentSnapshot)
      );
      return;
    }

    const newItems = items.filter((item: any) => {
      const id = String(Number(item.id));
      return id && !(id in knownSnapshot);
    });

    const updatedItems = items.filter((item: any) => {
      const id = String(Number(item.id));
      if (!id || !(id in knownSnapshot)) return false;
      return currentSnapshot[id] !== knownSnapshot[id];
    });

    if (newItems.length > 0 || updatedItems.length > 0) {
      setNotifications((prev) => {
        const upserted = new Map<number, PendingNotification>(
          prev.map((n) => [n.invitation_id, n])
        );

        newItems.forEach((item: any) => {
          const id = Number(item.id);
          if (!Number.isFinite(id)) return;
          const content = buildPendingNotificationContent(item, id);
          const existing = upserted.get(id);
          upserted.set(id, {
            id: existing?.id || `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            invitation_id: id,
            group_label: groupLabel(id),
            title: content.title,
            message: content.message,
            created_at: String(item.updated_at || item.created_at || new Date().toISOString()),
            read: false,
            type: content.type,
          });
        });

        updatedItems.forEach((item: any) => {
          const id = Number(item.id);
          if (!Number.isFinite(id)) return;
          const idKey = String(id);
          const prevSnapshot = String(knownSnapshot[idKey] || "");
          const prevStatusRaw = prevSnapshot.split("|")[0] || "";
          const nextStatusRaw = String(item.status || "");
          const prevStatus = humanizeStatus(prevStatusRaw);
          const nextStatus = humanizeStatus(nextStatusRaw);
          const sameStatus = prevStatusRaw.trim() === nextStatusRaw.trim().toLowerCase();
          const summary = participantsSummary(item);
          const normalizedNext = normalizeInvitationGroupStatus(nextStatusRaw);
          const isCorrection = normalizedNext === "pendiente de actualizacion";
          const type: PendingNotification["type"] = sameStatus
            ? "updated"
            : isCorrection
              ? "correction"
              : "status_change";
          const title = isCorrection
            ? `${groupLabel(id)} · Corrección solicitada`
            : sameStatus
              ? `${groupLabel(id)} · Progreso actualizado`
              : `${groupLabel(id)} · Cambio de estado`;
          const message = sameStatus
            ? `${item.event_name || `Evento ${item.event_id}`} · ${summary.approved} aprob., ${summary.rejected} rech., ${summary.pending} pend.`
            : `${item.event_name || `Evento ${item.event_id}`} · ${prevStatus} → ${nextStatus} · ${summary.approved} aprob., ${summary.rejected} rech., ${summary.pending} pend.`;
          const existing = upserted.get(id);
          upserted.set(id, {
            id: existing?.id || `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            invitation_id: id,
            group_label: groupLabel(id),
            title,
            message,
            created_at: String(item.updated_at || item.created_at || new Date().toISOString()),
            read: false,
            type,
          });
        });

        return Array.from(upserted.values())
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 50);
      });
    }

    localStorage.setItem(
      KNOWN_PENDING_SNAPSHOT_KEY,
      JSON.stringify(currentSnapshot)
    );
  }, [pendingQuery.data, canWatchApprovals]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );
  const filteredNotifications = useMemo(() => {
    if (notifFilter === "all") return notifications;
    return notifications.filter((n) => {
      const type = inferNotificationType(n);
      return type === notifFilter;
    });
  }, [notifications, notifFilter]);

  const notificationMeta = (
    type: PendingNotification["type"]
  ): {
    icon: React.ComponentType<{ className?: string }>;
    chip: string;
    chipClass: string;
  } => {
    if (type === "new") {
      return {
        icon: PlusCircle,
        chip: "Nueva",
        chipClass: "bg-blue-100 text-blue-700",
      };
    }
    if (type === "status_change") {
      return {
        icon: ArrowRightLeft,
        chip: "Estado",
        chipClass: "bg-amber-100 text-amber-700",
      };
    }
    if (type === "correction") {
      return {
        icon: RefreshCw,
        chip: "Corrección",
        chipClass: "bg-indigo-100 text-indigo-700",
      };
    }
    return {
      icon: RefreshCw,
      chip: "Actualización",
      chipClass: "bg-slate-100 text-slate-700",
    };
  };

  const markAllAsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openNotification = (notif: PendingNotification) => {
    setNotifications((prev) => {
      const next = prev.map((n) =>
        n.id === notif.id ? { ...n, read: true } : n
      );
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
    navigate("/approver/pending");
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => {
      const next = prev.filter((n) => n.id !== id);
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearNotifications = () => {
    setNotifications([]);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify([]));
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <QrCode className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-lg">EventAccess</span>
          </Link>

          {user && (
            <div className="flex items-center gap-1">
              {canWatchApprovals && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative">
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 && (
                        <Badge className="absolute -right-1 -top-1 h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px]">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <div className="px-3 py-2 border-b flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Notificaciones</p>
                        <p className="text-xs text-gray-500">
                          {pendingCount > 0
                            ? `${pendingCount} solicitud(es) por revisar`
                            : "No hay solicitudes pendientes"}
                        </p>
                      </div>
                      {notifications.length > 0 && (
                        <div className="flex items-center gap-3">
                          <DropdownMenuItem
                            className="h-auto px-0 py-0 text-xs text-blue-600 hover:underline focus:bg-transparent"
                            onSelect={(e) => {
                              e.preventDefault();
                              markAllAsRead();
                            }}
                          >
                            Marcar leídas
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="h-auto px-0 py-0 text-rose-600 focus:bg-transparent"
                            onSelect={(e) => {
                              e.preventDefault();
                              clearNotifications();
                            }}
                            aria-label="Borrar todas las notificaciones"
                            title="Borrar todas"
                          >
                            <Trash2 className="h-4 w-4" />
                          </DropdownMenuItem>
                        </div>
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="px-3 py-2 border-b flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNotifFilter("all")}
                          className={`text-[11px] px-2 py-1 rounded-full ${
                            notifFilter === "all"
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          Todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifFilter("new")}
                          className={`text-[11px] px-2 py-1 rounded-full ${
                            notifFilter === "new"
                              ? "bg-blue-600 text-white"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          Nuevas
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifFilter("status_change")}
                          className={`text-[11px] px-2 py-1 rounded-full ${
                            notifFilter === "status_change"
                              ? "bg-amber-600 text-white"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          Estado
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifFilter("correction")}
                          className={`text-[11px] px-2 py-1 rounded-full ${
                            notifFilter === "correction"
                              ? "bg-indigo-600 text-white"
                              : "bg-indigo-50 text-indigo-700"
                          }`}
                        >
                          Correcciones
                        </button>
                      </div>
                    )}
                    <div className="max-h-80 overflow-y-auto">
                      {filteredNotifications.length === 0 ? (
                        <div className="px-3 py-6 text-sm text-gray-500 text-center">
                          Sin notificaciones por ahora.
                        </div>
                      ) : (
                        filteredNotifications.map((notif) => (
                          <button
                            key={notif.id}
                            className={`w-full text-left px-3 py-2 border-b border-l-4 last:border-b-0 transition-colors ${
                              notif.read
                                ? "bg-white border-l-transparent hover:bg-slate-50"
                                : "bg-blue-100 border-l-blue-600 hover:bg-blue-200/70"
                            }`}
                            onClick={() => openNotification(notif)}
                          >
                            {(() => {
                              const meta = notificationMeta(inferNotificationType(notif));
                              const Icon = meta.icon;
                              return (
                                <>
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Icon className="h-4 w-4 text-slate-500 shrink-0" />
                                      <div
                                        className={`text-sm truncate ${
                                          notif.read
                                            ? "font-medium text-slate-700"
                                            : "font-semibold text-slate-900"
                                        }`}
                                      >
                                        {notif.title}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.chipClass}`}
                                      >
                                        {meta.chip}
                                      </span>
                                      <button
                                        type="button"
                                        aria-label="Eliminar notificación"
                                        className="inline-flex items-center justify-center h-6 w-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeNotification(notif.id);
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  <div
                                    className={`text-xs mt-0.5 ${
                                      notif.read
                                        ? "text-gray-600"
                                        : "text-slate-700"
                                    }`}
                                  >
                                    {notif.message}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-1 inline-flex items-center gap-1.5">
                                    {!notif.read && (
                                      <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
                                    )}
                                    {formatDateTime(notif.created_at)}
                                  </div>
                                </>
                              );
                            })()}
                          </button>
                        ))
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-2 border-b">
                    <p className="text-sm font-medium">{user.email}</p>
                    <p className="text-xs text-gray-500">{user.role}</p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate("/")}>
                    <User className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
