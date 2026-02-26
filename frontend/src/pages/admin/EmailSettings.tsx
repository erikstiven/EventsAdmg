import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import ReactQuill from 'react-quill';
import 'quill/dist/quill.snow.css';

export default function EmailSettings() {
  const { toast } = useToast();
  const quillRef = useRef<ReactQuill | null>(null);
  const qrQuillRef = useRef<ReactQuill | null>(null);
  const invitationHtmlRef = useRef<HTMLTextAreaElement | null>(null);
  const qrHtmlRef = useRef<HTMLTextAreaElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invitationEditorMode, setInvitationEditorMode] = useState<'visual' | 'html'>('html');
  const [qrEditorMode, setQrEditorMode] = useState<'visual' | 'html'>('html');
  const [form, setForm] = useState({
    BIOMETRIC_MATCH_THRESHOLD: '0.60',
    BIOMETRIC_MODEL_NAME: 'buffalo_l',
    SMTP_HOST: '',
    SMTP_PORT: '587',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: '',
    SMTP_USE_TLS: true,
    INVITATION_EMAIL_SUBJECT: '',
    INVITATION_EMAIL_TEMPLATE: '',
    INVITATION_QR_EMAIL_SUBJECT: '',
    INVITATION_QR_EMAIL_TEMPLATE: '',
  });

  const normalizeTemplateHtml = (content: string) => {
    const source = String(content || '').trim();
    if (!source) return '';
    const parser = new DOMParser();
    const decoded = (source.includes('&lt;') || source.includes('&gt;') || source.includes('&amp;'))
      ? (parser.parseFromString(source, 'text/html').documentElement.textContent || source)
      : source;
    return decoded
      .replace(/\u00a0/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<p>\s*(?:&nbsp;|\u00a0|\s)*((?:<\/?[a-zA-Z][^>]*>\s*)+)\s*<\/p>/gi, '$1')
      .replace(/<p>\s*(?:<br\s*\/?>|&nbsp;|\u00a0|\s)*<\/p>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/>\s+</g, '><')
      .trim();
  };

  const insertAtCursor = (
    ref: React.RefObject<HTMLTextAreaElement | null>,
    currentValue: string,
    variable: string,
    update: (next: string) => void
  ) => {
    const input = ref.current;
    if (!input) {
      update(`${currentValue || ''}${variable}`);
      return;
    }
    const start = input.selectionStart ?? currentValue.length;
    const end = input.selectionEnd ?? currentValue.length;
    const next = `${currentValue.slice(0, start)}${variable}${currentValue.slice(end)}`;
    update(next);
    window.requestAnimationFrame(() => {
      input.focus();
      const pos = start + variable.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const insertVariable = (variable: string) => {
    if (invitationEditorMode === 'visual') {
      const editor = quillRef.current?.getEditor();
      const range = editor?.getSelection(true);
      if (editor && range) {
        editor.insertText(range.index, variable);
        editor.setSelection(range.index + variable.length, 0);
        return;
      }
    }
    insertAtCursor(invitationHtmlRef, form.INVITATION_EMAIL_TEMPLATE, variable, (next) =>
      setForm((f) => ({ ...f, INVITATION_EMAIL_TEMPLATE: next }))
    );
  };

  const insertQrVariable = (variable: string) => {
    if (qrEditorMode === 'visual') {
      const editor = qrQuillRef.current?.getEditor();
      const range = editor?.getSelection(true);
      if (editor && range) {
        editor.insertText(range.index, variable);
        editor.setSelection(range.index + variable.length, 0);
        return;
      }
    }
    insertAtCursor(qrHtmlRef, form.INVITATION_QR_EMAIL_TEMPLATE, variable, (next) =>
      setForm((f) => ({ ...f, INVITATION_QR_EMAIL_TEMPLATE: next }))
    );
  };

  useEffect(() => {
    const load = async () => {
      try {
        const settings = await api.settings.get();
        const backendVars = settings.backend_vars || {};
        setForm((prev) => ({
          ...prev,
          BIOMETRIC_MATCH_THRESHOLD:
            backendVars.BIOMETRIC_MATCH_THRESHOLD?.value || prev.BIOMETRIC_MATCH_THRESHOLD,
          BIOMETRIC_MODEL_NAME:
            backendVars.BIOMETRIC_MODEL_NAME?.value || prev.BIOMETRIC_MODEL_NAME,
          SMTP_HOST: backendVars.SMTP_HOST?.value || prev.SMTP_HOST,
          SMTP_PORT: backendVars.SMTP_PORT?.value || prev.SMTP_PORT,
          SMTP_USER: backendVars.SMTP_USER?.value || prev.SMTP_USER,
          SMTP_PASS: backendVars.SMTP_PASS?.value || prev.SMTP_PASS,
          SMTP_FROM: backendVars.SMTP_FROM?.value || prev.SMTP_FROM,
          SMTP_USE_TLS: (backendVars.SMTP_USE_TLS?.value || 'true').toLowerCase() === 'true',
          INVITATION_EMAIL_SUBJECT:
            backendVars.INVITATION_EMAIL_SUBJECT?.value || prev.INVITATION_EMAIL_SUBJECT,
          INVITATION_EMAIL_TEMPLATE:
            normalizeTemplateHtml(backendVars.INVITATION_EMAIL_TEMPLATE?.value || prev.INVITATION_EMAIL_TEMPLATE),
          INVITATION_QR_EMAIL_SUBJECT:
            backendVars.INVITATION_QR_EMAIL_SUBJECT?.value || prev.INVITATION_QR_EMAIL_SUBJECT,
          INVITATION_QR_EMAIL_TEMPLATE:
            normalizeTemplateHtml(backendVars.INVITATION_QR_EMAIL_TEMPLATE?.value || prev.INVITATION_QR_EMAIL_TEMPLATE),
        }));
      } catch {
        toast({
          title: 'Error',
          description: 'No se pudieron cargar las configuraciones del sistema.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const threshold = Number(form.BIOMETRIC_MATCH_THRESHOLD);
      if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
        toast({
          title: 'Valor inválido',
          description: 'El umbral biométrico debe estar entre 0 y 1.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }

      const updates: [string, string][] = [
        ['BIOMETRIC_MATCH_THRESHOLD', String(threshold)],
        ['BIOMETRIC_MODEL_NAME', form.BIOMETRIC_MODEL_NAME],
        ['SMTP_HOST', form.SMTP_HOST],
        ['SMTP_PORT', form.SMTP_PORT],
        ['SMTP_USER', form.SMTP_USER],
        ['SMTP_PASS', form.SMTP_PASS],
        ['SMTP_FROM', form.SMTP_FROM],
        ['SMTP_USE_TLS', form.SMTP_USE_TLS ? 'true' : 'false'],
        ['INVITATION_EMAIL_SUBJECT', form.INVITATION_EMAIL_SUBJECT],
        ['INVITATION_EMAIL_TEMPLATE', form.INVITATION_EMAIL_TEMPLATE],
        ['INVITATION_QR_EMAIL_SUBJECT', form.INVITATION_QR_EMAIL_SUBJECT],
        ['INVITATION_QR_EMAIL_TEMPLATE', form.INVITATION_QR_EMAIL_TEMPLATE],
      ];
      await Promise.all(updates.map(([key, value]) => api.settings.updateBackend(key, value)));
      toast({
        title: 'Guardado',
        description: 'Configuración guardada correctamente.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6 pb-28">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Configuración del sistema</h1>
          <p className="text-gray-600">Configura biometría y correo para el flujo de invitaciones.</p>
        </div>

        <Tabs defaultValue="biometria" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto gap-1">
            <TabsTrigger value="biometria">Biometría</TabsTrigger>
            <TabsTrigger value="smtp">Correo SMTP</TabsTrigger>
            <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          </TabsList>

          <TabsContent value="biometria">
            <Card>
              <CardHeader>
                <CardTitle>Parámetros biométricos</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Umbral de coincidencia (0 a 1)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={form.BIOMETRIC_MATCH_THRESHOLD}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, BIOMETRIC_MATCH_THRESHOLD: e.target.value }))
                    }
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    A mayor umbral, menor tolerancia. Valor inicial recomendado: 0.60.
                  </p>
                </div>
                <div>
                  <Label>Modelo biométrico</Label>
                  <Input
                    value={form.BIOMETRIC_MODEL_NAME}
                    onChange={(e) => setForm((f) => ({ ...f, BIOMETRIC_MODEL_NAME: e.target.value }))}
                    placeholder="buffalo_l"
                    disabled={loading}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="smtp">
            <Card>
              <CardHeader>
                <CardTitle>Configuración de correo</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 text-sm text-gray-600">
                  Configura el envío de correos y el remitente para invitaciones y aprobaciones.
                </div>
                <div>
                  <Label>Servidor SMTP</Label>
                  <Input
                    value={form.SMTP_HOST}
                    onChange={(e) => setForm((f) => ({ ...f, SMTP_HOST: e.target.value }))}
                    placeholder="smtp.gmail.com"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label>Puerto</Label>
                  <Input
                    value={form.SMTP_PORT}
                    onChange={(e) => setForm((f) => ({ ...f, SMTP_PORT: e.target.value }))}
                    placeholder="587"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label>Usuario (correo)</Label>
                  <Input
                    value={form.SMTP_USER}
                    onChange={(e) => setForm((f) => ({ ...f, SMTP_USER: e.target.value }))}
                    placeholder="correo@dominio.com"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label>Contraseña de aplicación</Label>
                  <Input
                    type="password"
                    value={form.SMTP_PASS}
                    onChange={(e) => setForm((f) => ({ ...f, SMTP_PASS: e.target.value }))}
                    placeholder="app password"
                    disabled={loading}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Remitente</Label>
                  <Input
                    value={form.SMTP_FROM}
                    onChange={(e) => setForm((f) => ({ ...f, SMTP_FROM: e.target.value }))}
                    placeholder="EventAccess <correo@dominio.com>"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500 mt-1">Recomendado: usar el mismo correo del usuario SMTP.</p>
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Switch
                    id="smtpTls"
                    checked={form.SMTP_USE_TLS}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, SMTP_USE_TLS: checked }))}
                    disabled={loading}
                  />
                  <Label htmlFor="smtpTls">Usar conexión segura (TLS)</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plantillas">
            <Accordion type="single" collapsible className="space-y-3">
              <AccordionItem value="invitacion" className="border rounded-lg bg-white px-4">
                <AccordionTrigger className="text-lg font-semibold">Plantilla de invitación</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="text-sm text-gray-600">
                    Define el correo que recibe el invitado al crearse la invitación.
                  </div>
                  <div>
                    <Label>Asunto del correo</Label>
                    <Input
                      value={form.INVITATION_EMAIL_SUBJECT}
                      onChange={(e) => setForm((f) => ({ ...f, INVITATION_EMAIL_SUBJECT: e.target.value }))}
                      placeholder="Tu invitación a EventAccess"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label>Contenido</Label>
                    <div className="mb-2 inline-flex rounded-md border bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setInvitationEditorMode('visual')}
                        className={`px-2.5 py-1 text-xs rounded ${invitationEditorMode === 'visual' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                      >
                        Texto
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvitationEditorMode('html')}
                        className={`px-2.5 py-1 text-xs rounded ${invitationEditorMode === 'html' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                      >
                        Codigo
                      </button>
                    </div>
                    <div className="border rounded-md overflow-hidden bg-white">
                      {invitationEditorMode === 'visual' ? (
                        <ReactQuill
                          ref={quillRef}
                          theme="snow"
                          value={form.INVITATION_EMAIL_TEMPLATE}
                          onChange={(value) => setForm((f) => ({ ...f, INVITATION_EMAIL_TEMPLATE: value }))}
                          placeholder="Escribe el contenido del correo..."
                          readOnly={loading}
                          modules={{
                            toolbar: [
                              [{ header: [1, 2, 3, false] }],
                              ['bold', 'italic', 'underline', 'strike'],
                              [{ color: [] }, { background: [] }],
                              [{ list: 'ordered' }, { list: 'bullet' }],
                              ['link', 'image'],
                              ['clean'],
                            ],
                          }}
                        />
                      ) : (
                        <Textarea
                          ref={invitationHtmlRef}
                          value={form.INVITATION_EMAIL_TEMPLATE}
                          onChange={(e) => setForm((f) => ({ ...f, INVITATION_EMAIL_TEMPLATE: e.target.value }))}
                          placeholder="Pega aqui HTML completo de email..."
                          disabled={loading}
                          className="min-h-[340px] font-mono text-xs leading-5 border-0 rounded-none"
                        />
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">`Texto`: escribir normal. `Codigo`: pegar HTML.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>Insertar variable:</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertVariable('{{nombre}}')}>
                        Nombre
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertVariable('{{link}}')}>
                        Link
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertVariable('{{evento}}')}>
                        Evento
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertVariable('{{fecha}}')}>
                        Fecha
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="qr" className="border rounded-lg bg-white px-4">
                <AccordionTrigger className="text-lg font-semibold">Plantilla de QR (aprobación)</AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <div className="text-sm text-gray-600">
                    Define el correo que se envía cuando una invitación es aprobada.
                  </div>
                  <div>
                    <Label>Asunto del correo</Label>
                    <Input
                      value={form.INVITATION_QR_EMAIL_SUBJECT}
                      onChange={(e) => setForm((f) => ({ ...f, INVITATION_QR_EMAIL_SUBJECT: e.target.value }))}
                      placeholder="Tu QR de acceso"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label>Contenido</Label>
                    <div className="mb-2 inline-flex rounded-md border bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setQrEditorMode('visual')}
                        className={`px-2.5 py-1 text-xs rounded ${qrEditorMode === 'visual' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                      >
                        Texto
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrEditorMode('html')}
                        className={`px-2.5 py-1 text-xs rounded ${qrEditorMode === 'html' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                      >
                        Codigo
                      </button>
                    </div>
                    <div className="border rounded-md overflow-hidden bg-white">
                      {qrEditorMode === 'visual' ? (
                        <ReactQuill
                          ref={qrQuillRef}
                          theme="snow"
                          value={form.INVITATION_QR_EMAIL_TEMPLATE}
                          onChange={(value) => setForm((f) => ({ ...f, INVITATION_QR_EMAIL_TEMPLATE: value }))}
                          placeholder="Escribe el contenido del correo..."
                          readOnly={loading}
                          modules={{
                            toolbar: [
                              [{ header: [1, 2, 3, false] }],
                              ['bold', 'italic', 'underline', 'strike'],
                              [{ color: [] }, { background: [] }],
                              [{ list: 'ordered' }, { list: 'bullet' }],
                              ['link', 'image'],
                              ['clean'],
                            ],
                          }}
                        />
                      ) : (
                        <Textarea
                          ref={qrHtmlRef}
                          value={form.INVITATION_QR_EMAIL_TEMPLATE}
                          onChange={(e) => setForm((f) => ({ ...f, INVITATION_QR_EMAIL_TEMPLATE: e.target.value }))}
                          placeholder="Pega aqui HTML completo de email..."
                          disabled={loading}
                          className="min-h-[340px] font-mono text-xs leading-5 border-0 rounded-none"
                        />
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Coloca <code>{'{{qr_image}}'}</code> en el punto exacto donde quieres que aparezca la imagen QR.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>Insertar variable:</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertQrVariable('{{nombre}}')}>
                        Nombre
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertQrVariable('{{link}}')}>
                        Link
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertQrVariable('{{evento}}')}>
                        Evento
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertQrVariable('{{fecha}}')}>
                        Fecha
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertQrVariable('{{qr_image}}')}>
                        QR (imagen)
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => insertQrVariable('{{qr_image_src}}')}>
                        QR src
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>

        <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">Revisa los cambios antes de guardar.</p>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
