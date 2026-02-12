import React, { useMemo, useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api, Event } from '@/lib/api';
import { Plus, Calendar, MapPin, Clock, Eye, Pencil, Power } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    event_date: '',
    start_time: '',
    end_time: '',
    status: 'ACTIVE',
  });

  const [filters, setFilters] = useState({
    search: '',
    dateFrom: '',
    dateTo: '',
    status: 'all',
    sort: '-event_date',
  });

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async (overrideFilters?: Partial<typeof filters>) => {
    try {
      const f = { ...filters, ...(overrideFilters || {}) };
      const response = await api.events.list({
        search: f.search || undefined,
        date_from: f.dateFrom || undefined,
        date_to: f.dateTo || undefined,
        status: f.status === 'all' ? undefined : f.status,
        sort: f.sort || undefined,
      });
      setEvents(response.items || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los eventos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing && detailEvent) {
        await api.events.update(detailEvent.id, formData);
        toast({
          title: 'Éxito',
          description: 'Evento actualizado correctamente',
        });
      } else {
        await api.events.create(formData);
        toast({
          title: 'Éxito',
          description: 'Evento creado correctamente',
        });
      }

      setDialogOpen(false);
      setIsEditing(false);
      setDetailEvent(null);
      setFormData({
        name: '',
        description: '',
        location: '',
        event_date: '',
        start_time: '',
        end_time: '',
        status: 'ACTIVE',
      });
      loadEvents();
    } catch (error: any) {
      const detail = error?.data?.detail 
                  || error?.response?.data?.detail 
                  || error.message 
                  || 'No se pudo crear el evento';
      
      // Format validation errors if it's an array
      let errorMessage = detail;
      if (Array.isArray(detail)) {
        errorMessage = detail.map((err: any) => `${err.loc?.join('.')}: ${err.msg}`).join(', ');
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const openCreate = () => {
    setIsEditing(false);
    setDetailEvent(null);
    setFormData({
      name: '',
      description: '',
      location: '',
      event_date: '',
      start_time: '',
      end_time: '',
      status: 'ACTIVE',
    });
    setDialogOpen(true);
  };

  const openEdit = (event: Event) => {
    setIsEditing(true);
    setDetailEvent(event);
    setFormData({
      name: event.name || '',
      description: event.description || '',
      location: event.location || '',
      event_date: event.event_date?.slice(0, 10) || '',
      start_time: event.start_time || '',
      end_time: event.end_time || '',
      status: event.status || 'ACTIVE',
    });
    setDialogOpen(true);
  };

  const openDetail = (event: Event) => {
    setDetailEvent(event);
    setDetailOpen(true);
  };

  const toggleStatus = async (event: Event) => {
    const nextStatus = event.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.events.update(event.id, { status: nextStatus });
      toast({
        title: 'Éxito',
        description: `Evento ${nextStatus === 'ACTIVE' ? 'activado' : 'desactivado'}`,
      });
      loadEvents();
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado del evento',
        variant: 'destructive',
      });
    }
  };

  const eventsCount = useMemo(() => events.length, [events]);
  const hasActiveFilters = useMemo(() => {
    return (
      !!filters.search ||
      !!filters.dateFrom ||
      !!filters.dateTo ||
      filters.status !== 'all' ||
      filters.sort !== '-event_date'
    );
  }, [filters]);

  const formatStatus = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Activo';
      case 'INACTIVE':
        return 'Inactivo';
      case 'FINALIZED':
        return 'Finalizado';
      default:
        return status || '-';
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestión de Eventos</h1>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Evento
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Input
              className="md:col-span-2"
              placeholder="Buscar por nombre o ubicación"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ACTIVE">Activo</SelectItem>
                <SelectItem value="INACTIVE">Inactivo</SelectItem>
                <SelectItem value="FINALIZED">Finalizado</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.sort}
              onValueChange={(v) => setFilters((f) => ({ ...f, sort: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Orden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-event_date">Fecha (reciente)</SelectItem>
                <SelectItem value="event_date">Fecha (antigua)</SelectItem>
                <SelectItem value="name">Nombre (A-Z)</SelectItem>
                <SelectItem value="-name">Nombre (Z-A)</SelectItem>
              </SelectContent>
            </Select>
            <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                {hasActiveFilters ? 'Filtros activos' : 'Sin filtros activos'}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => loadEvents()}>
                  Aplicar filtros
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilters({
                      search: '',
                      dateFrom: '',
                      dateTo: '',
                      status: 'all',
                      sort: '-event_date',
                    });
                    loadEvents({
                      search: '',
                      dateFrom: '',
                      dateTo: '',
                      status: 'all',
                      sort: '-event_date',
                    });
                  }}
                >
                  Limpiar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <CardTitle>Eventos ({eventsCount})</CardTitle>
            {hasActiveFilters && (
              <div className="text-xs text-gray-500">Mostrando resultados filtrados</div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell className="text-gray-600">{event.location}</TableCell>
                    <TableCell>
                      {event.event_date
                        ? new Date(event.event_date).toLocaleDateString('es-ES')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {event.start_time} - {event.end_time}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={event.status === 'ACTIVE' ? 'default' : 'outline'}
                        className={
                          event.status === 'FINALIZED'
                            ? 'border-slate-300 text-slate-600'
                            : event.status === 'INACTIVE'
                            ? 'border-amber-300 text-amber-700'
                            : ''
                        }
                      >
                        {formatStatus(event.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => openDetail(event)}>
                        <Eye className="h-4 w-4 mr-1" /> Ver
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(event)}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant={event.status === 'ACTIVE' ? 'destructive' : 'secondary'}
                        onClick={() => toggleStatus(event)}
                      >
                        <Power className="h-4 w-4 mr-1" />
                        {event.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      No hay eventos para los filtros actuales.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {events.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No hay eventos creados. Haz clic en "Nuevo Evento" para comenzar.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Evento' : 'Crear Nuevo Evento'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre del Evento</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="location">Ubicación</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="event_date">Fecha</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="start_time">Hora Inicio</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="end_time">Hora Fin</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Activo</SelectItem>
                  <SelectItem value="INACTIVE">Inactivo</SelectItem>
                  <SelectItem value="FINALIZED">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{isEditing ? 'Guardar cambios' : 'Crear Evento'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Evento</DialogTitle>
          </DialogHeader>
          {detailEvent && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
              <div>
                <div className="text-xs text-gray-500">Nombre</div>
                <Input value={detailEvent.name} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Estado</div>
                <Input value={formatStatus(detailEvent.status)} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Ubicación</div>
                <Input value={detailEvent.location} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Fecha</div>
                <Input value={detailEvent.event_date?.slice(0, 10) || ''} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Hora inicio</div>
                <Input value={detailEvent.start_time} disabled />
              </div>
              <div>
                <div className="text-xs text-gray-500">Hora fin</div>
                <Input value={detailEvent.end_time} disabled />
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-gray-500">Descripción</div>
                <Textarea value={detailEvent.description || ''} disabled rows={3} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
