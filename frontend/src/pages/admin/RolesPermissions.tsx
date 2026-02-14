import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { AlertTriangle, RotateCcw, Save, ShieldCheck } from 'lucide-react';

type RoleItem = {
  id: number;
  code: string;
  name: string;
  permissions: string[];
  is_active?: boolean;
};

type PermissionItem = {
  id: number;
  code: string;
  name: string;
  module: string;
  description?: string;
  is_sensitive?: boolean;
};

const MODULE_ORDER = ['APPROVALS', 'CHECKIN', 'EVENTS', 'INVITATIONS', 'ATTENDEES', 'STAFF', 'AUDIT'];
const SENSITIVE_EXACT = new Set(['approvals.decide', 'checkin.manual_approve']);

const MODULE_LABELS: Record<string, string> = {
  APPROVALS: 'Aprobaciones',
  CHECKIN: 'Control de acceso',
  EVENTS: 'Eventos',
  INVITATIONS: 'Invitaciones',
  ATTENDEES: 'Asistentes',
  STAFF: 'Personal',
  AUDIT: 'Auditoría',
};

function cloneSelected(source: Record<number, Set<string>>) {
  const copy: Record<number, Set<string>> = {};
  Object.entries(source).forEach(([roleId, perms]) => {
    copy[Number(roleId)] = new Set(Array.from(perms));
  });
  return copy;
}

function isSensitivePermission(code: string) {
  return code.endsWith('.delete') || SENSITIVE_EXACT.has(code);
}

function buildDependencyMap(selectedSet: Set<string>) {
  const required = new Map<string, Set<string>>();

  const require = (dep: string, src: string) => {
    if (!required.has(dep)) required.set(dep, new Set());
    required.get(dep)!.add(src);
  };

  selectedSet.forEach((code) => {
    if (code.endsWith('.update') || code.endsWith('.delete')) {
      const resource = code.split('.')[0];
      require(`${resource}.read`, code);
    }
    if (code === 'approvals.decide') require('approvals.read', code);
    if (code === 'checkin.biometric') require('checkin.scan', code);
    if (code === 'checkin.manual_approve') require('checkin.scan', code);
  });

  return required;
}

export default function RolesPermissions() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [selected, setSelected] = useState<Record<number, Set<string>>>({});
  const [baseline, setBaseline] = useState<Record<number, Set<string>>>({});
  const [search, setSearch] = useState('');
  const [addedDependencies, setAddedDependencies] = useState<Record<number, string[]>>({});
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.rbac.catalog();
      const nextRoles = (res.roles || []) as RoleItem[];
      const nextPerms = (res.permissions || []) as PermissionItem[];
      const initial: Record<number, Set<string>> = {};
      nextRoles.forEach((role) => {
        initial[role.id] = new Set(role.permissions || []);
      });
      setRoles(nextRoles);
      setPermissions(nextPerms);
      setSelected(cloneSelected(initial));
      setBaseline(cloneSelected(initial));
      setAddedDependencies({});
      if (!selectedRoleId) {
        const firstEditable = nextRoles.find((role) => role.code !== 'ADMIN');
        setSelectedRoleId(firstEditable?.id ?? nextRoles[0]?.id ?? null);
      }
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'No se pudo cargar la configuración RBAC.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredPermissions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return permissions;
    return permissions.filter(
      (p) =>
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.module.toLowerCase().includes(term)
    );
  }, [permissions, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionItem[]>();
    filteredPermissions.forEach((perm) => {
      if (!map.has(perm.module)) map.set(perm.module, []);
      map.get(perm.module)!.push(perm);
    });
    return Array.from(map.entries()).sort((a, b) => {
      const ia = MODULE_ORDER.indexOf(a[0]);
      const ib = MODULE_ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [filteredPermissions]);

  const activeRole = useMemo(() => roles.find((r) => r.id === selectedRoleId) || null, [roles, selectedRoleId]);
  const isAdminRole = activeRole?.code === 'ADMIN';
  const hasChanges = useMemo(() => {
    if (!activeRole) return false;
    const current = Array.from(selected[activeRole.id] || []).sort().join('|');
    const initial = Array.from(baseline[activeRole.id] || []).sort().join('|');
    return current !== initial;
  }, [activeRole, selected, baseline]);

  const selectedCount = activeRole ? (selected[activeRole.id]?.size || 0) : 0;
  const selectedCriticalCount = activeRole
    ? Array.from(selected[activeRole.id] || []).filter((code) => isSensitivePermission(code)).length
    : 0;

  const criticalPermissions = useMemo(
    () => permissions.filter((p) => isSensitivePermission(p.code)),
    [permissions]
  );

  const permissionsByModule = useMemo(() => {
    return grouped.map(([module, perms]) => [module, perms.filter((p) => !isSensitivePermission(p.code))] as const);
  }, [grouped]);

  const dependencyMap = useMemo(() => {
    if (!activeRole) return new Map<string, Set<string>>();
    return buildDependencyMap(selected[activeRole.id] || new Set());
  }, [activeRole, selected]);

  const togglePermission = (roleId: number, permissionCode: string, checked: boolean) => {
    if (checked && isSensitivePermission(permissionCode)) {
      const ok = window.confirm(
        'Este permiso es sensible y puede afectar seguridad operativa. ¿Deseas habilitarlo?'
      );
      if (!ok) return;
    }

    setSelected((prev) => {
      const copy = cloneSelected(prev);
      const current = copy[roleId] || new Set<string>();
      if (checked) current.add(permissionCode);
      else current.delete(permissionCode);
      copy[roleId] = current;
      return copy;
    });
  };

  const selectAllByModule = (moduleName: string, roleId: number) => {
    const modulePerms = permissions.filter((p) => p.module === moduleName).map((p) => p.code);
    setSelected((prev) => {
      const copy = cloneSelected(prev);
      const current = copy[roleId] || new Set<string>();
      const shouldClear = modulePerms.every((code) => current.has(code));
      if (shouldClear) {
        modulePerms.forEach((code) => current.delete(code));
      } else {
        modulePerms.forEach((code) => current.add(code));
      }
      copy[roleId] = current;
      return copy;
    });
  };

  const resetChanges = () => {
    if (!activeRole) return;
    setSelected((prev) => {
      const next = cloneSelected(prev);
      next[activeRole.id] = new Set(Array.from(baseline[activeRole.id] || []));
      return next;
    });
    setAddedDependencies((prev) => ({ ...prev, [activeRole.id]: [] }));
  };

  const saveChanges = async () => {
    if (!activeRole) return;
    try {
      setSaving(true);
      const payload = Array.from(selected[activeRole.id] || []).sort();
      const res = await api.rbac.updateRolePermissions(activeRole.id, payload);
      const deps = (res?.added_dependencies || []) as string[];
      setAddedDependencies((prev) => ({ ...prev, [activeRole.id]: deps }));
      toast({
        title: 'Actualizado',
        description: `Se actualizó el rol ${activeRole.name}.`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e?.message || 'No se pudieron guardar los cambios.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const onRoleChange = (nextRoleId: string) => {
    if (hasChanges) {
      const confirmLeave = window.confirm(
        'Tienes cambios sin guardar en este rol. Si cambias de rol, se descartarán.'
      );
      if (!confirmLeave) return;
      resetChanges();
    }
    setSelectedRoleId(Number(nextRoleId));
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasChanges]);

  return (
    <Layout>
      <TooltipProvider>
      <div className="max-w-6xl mx-auto space-y-6 pb-24">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Gestión de roles y permisos</h1>
            <p className="text-gray-600">
              Edita un rol por vez. Las dependencias se autocompletan desde backend.
            </p>
          </div>
          <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Comparar roles</Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl">
              <DialogHeader>
                <DialogTitle>Comparador de roles (solo lectura)</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-auto rounded border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="border-b">
                      <th className="text-left px-3 py-2">Permiso</th>
                      {roles.map((role) => (
                        <th key={`cmp-head-${role.id}`} className="px-3 py-2 text-center">
                          {role.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((perm) => (
                      <tr key={`cmp-${perm.code}`} className="border-b">
                        <td className="px-3 py-2">
                          <div className="font-medium">{perm.name}</div>
                          <div className="text-xs text-gray-500">{perm.code}</div>
                        </td>
                        {roles.map((role) => (
                          <td key={`cmp-${perm.code}-${role.id}`} className="text-center px-3 py-2">
                            <Checkbox checked={Boolean(selected[role.id]?.has(perm.code))} disabled />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Configuración por rol
            </CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Rol a editar</div>
                <Select
                  value={selectedRoleId ? String(selectedRoleId) : ''}
                  onValueChange={onRoleChange}
                  disabled={loading || saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={`role-opt-${role.id}`} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Buscar permiso</div>
                <Input
                  placeholder="Código, nombre o módulo"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <div className="text-sm text-gray-500 py-6">Cargando configuración RBAC...</div>}

            {!loading && activeRole && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Permisos activos</div>
                    <div className="text-2xl font-semibold">{selectedCount}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Permisos críticos</div>
                    <div className="text-2xl font-semibold">{selectedCriticalCount}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-gray-500">Última modificación</div>
                    <div className="text-sm font-medium">No disponible</div>
                  </div>
                </div>

                {isAdminRole && (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    ADMIN no es editable.
                  </div>
                )}

                <Accordion type="multiple" className="w-full border rounded-md px-4">
                  <AccordionItem value="critical">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span>Permisos críticos</span>
                        <Badge variant="outline">{criticalPermissions.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      {criticalPermissions.map((perm) => {
                        const isChecked = selected[activeRole.id]?.has(perm.code) || false;
                        const deps = dependencyMap.get(perm.code);
                        const depSources = deps ? Array.from(deps).join(', ') : '';
                        const isRequired = Boolean(deps?.size);
                        return (
                          <div
                            key={`critical-${perm.code}`}
                            className="flex items-start justify-between gap-3 border rounded-md p-3"
                          >
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {perm.name}
                                {isRequired && (
                                  <Badge variant="secondary">Requerido</Badge>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="cursor-help">Info</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{perm.description || perm.code}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <div className="text-xs text-gray-500">{perm.code}</div>
                              {isRequired && (
                                <div className="text-xs text-amber-600">
                                  Requerido por: {depSources}
                                </div>
                              )}
                            </div>
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(v) => togglePermission(activeRole.id, perm.code, Boolean(v))}
                              disabled={saving || isAdminRole || (isRequired && isChecked)}
                            />
                          </div>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>

                  {permissionsByModule.map(([moduleName, perms]) => (
                    <AccordionItem key={`module-${moduleName}`} value={moduleName}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span>{MODULE_LABELS[moduleName] || moduleName}</span>
                          <Badge variant="outline">{perms.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => selectAllByModule(moduleName, activeRole.id)}
                            disabled={saving || isAdminRole}
                          >
                            Seleccionar todo por módulo
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {perms.map((perm) => (
                            <div
                              key={`${moduleName}-${perm.code}`}
                              className="flex items-start justify-between gap-3 border rounded-md p-3"
                            >
                              <div className="space-y-1">
                                <div className="font-medium flex items-center gap-2">
                                  {perm.name}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="cursor-help">Info</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{perm.description || perm.code}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  {dependencyMap.has(perm.code) && (
                                    <Badge variant="secondary">Requerido</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500">{perm.code}</div>
                                {dependencyMap.has(perm.code) && (
                                  <div className="text-xs text-amber-600">
                                    Requerido por: {Array.from(dependencyMap.get(perm.code) || []).join(', ')}
                                  </div>
                                )}
                              </div>
                              <Checkbox
                                checked={selected[activeRole.id]?.has(perm.code) || false}
                                onCheckedChange={(v) => togglePermission(activeRole.id, perm.code, Boolean(v))}
                                disabled={
                                  saving ||
                                  isAdminRole ||
                                  (dependencyMap.has(perm.code) && selected[activeRole.id]?.has(perm.code))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </>
            )}

            {activeRole && (addedDependencies[activeRole.id] || []).length > 0 && (
              <div className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded px-3 py-2">
                Dependencias agregadas automáticamente: {addedDependencies[activeRole.id].join(', ')}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="fixed bottom-4 left-0 right-0 px-4 z-40">
          <div className="max-w-6xl mx-auto bg-white border rounded-lg shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {hasChanges ? (
                <span className="text-amber-700 font-medium">Tienes cambios pendientes por guardar.</span>
              ) : (
                <span className="text-gray-500">Sin cambios pendientes.</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={resetChanges} disabled={!hasChanges || saving || isAdminRole}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Deshacer cambios
              </Button>
              <Button onClick={saveChanges} disabled={!hasChanges || saving || isAdminRole}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      </TooltipProvider>
    </Layout>
  );
}
