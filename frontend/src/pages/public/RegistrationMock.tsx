import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, UserPlus, Users, Camera, Upload } from 'lucide-react';

type Person = {
  fullName: string;
  idNumber: string;
  email: string;
  phone: string;
  codigoDactilar: string;
};

export default function RegistrationMock() {
  const { token } = useParams();
  const [titular, setTitular] = useState<Person>({
    fullName: 'Titular prellenado',
    idNumber: '',
    email: '',
    phone: '',
    codigoDactilar: '',
  });
  const [companions, setCompanions] = useState<Person[]>([]);
  const totalCupo = 3;
  const remaining = useMemo(() => totalCupo - 1 - companions.length, [companions.length, totalCupo]);

  const addCompanion = () => {
    if (remaining <= 0) return;
    setCompanions((prev) => [
      ...prev,
      { fullName: '', idNumber: '', email: '', phone: '', codigoDactilar: '' },
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Registro de Invitación</h1>
            <p className="text-gray-600">
              Completa tus datos y los de tus acompañantes. Cupos totales: {totalCupo}.
            </p>
          </div>
          <Badge variant="outline" className="text-xs uppercase">
            Demo visual (sin backend)
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Titular
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="default">
              <AlertTitle>Token</AlertTitle>
              <AlertDescription className="font-mono text-xs text-gray-700 break-all">
                {token || 'demo-token-12345'}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={titular.fullName}
                  onChange={(e) => setTitular((p) => ({ ...p, fullName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Cédula / ID</Label>
                <Input
                  value={titular.idNumber}
                  onChange={(e) => setTitular((p) => ({ ...p, idNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={titular.email}
                  onChange={(e) => setTitular((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={titular.phone}
                  onChange={(e) => setTitular((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label>Código dactilar</Label>
                <Input
                  value={titular.codigoDactilar}
                  onChange={(e) => setTitular((p) => ({ ...p, codigoDactilar: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-dashed rounded-lg p-4 flex flex-col gap-3 bg-slate-50">
                <div className="text-sm font-medium text-gray-700">Selfie biométrica</div>
                <p className="text-xs text-gray-500">Toma o sube una foto frontal del rostro del titular.</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm">
                    <Camera className="h-4 w-4 mr-2" />
                    Tomar selfie
                  </Button>
                  <Button type="button" variant="ghost" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Subir foto
                  </Button>
                </div>
              </div>
              <div className="border border-dashed rounded-lg p-4 flex flex-col gap-3 bg-slate-50">
                <div className="text-sm font-medium text-gray-700">Foto de cédula</div>
                <p className="text-xs text-gray-500">Sube foto del documento (frontal o ambas caras).</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Subir cédula
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <CardTitle>Acompañantes</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Restantes: <span className="font-semibold">{Math.max(remaining, 0)}</span> de {totalCupo - 1}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {companions.map((comp, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3 bg-white shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre completo</Label>
                    <Input
                      value={comp.fullName}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, fullName: e.target.value } : c))
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Cédula / ID</Label>
                    <Input
                      value={comp.idNumber}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, idNumber: e.target.value } : c))
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={comp.email}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, email: e.target.value } : c))
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input
                      value={comp.phone}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, phone: e.target.value } : c))
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Código dactilar</Label>
                    <Input
                      value={comp.codigoDactilar}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, codigoDactilar: e.target.value } : c))
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-dashed rounded-lg p-3 flex flex-col gap-2 bg-slate-50">
                    <div className="text-sm font-medium text-gray-700">Selfie biométrica</div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm">
                        <Camera className="h-4 w-4 mr-1" />
                        Tomar selfie
                      </Button>
                      <Button type="button" variant="ghost" size="sm">
                        <Upload className="h-4 w-4 mr-1" />
                        Subir foto
                      </Button>
                    </div>
                  </div>
                  <div className="border border-dashed rounded-lg p-3 flex flex-col gap-2 bg-slate-50">
                    <div className="text-sm font-medium text-gray-700">Foto de cédula</div>
                    <Button type="button" variant="outline" size="sm" className="w-fit">
                      <Upload className="h-4 w-4 mr-2" />
                      Subir cédula
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {remaining > 0
                  ? `Puedes agregar ${remaining} acompañante(s) más.`
                  : 'Cupo completado.'}
              </div>
              <Button type="button" onClick={addCompanion} disabled={remaining <= 0}>
                <UserPlus className="h-4 w-4 mr-2" />
                Agregar acompañante
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm">Demostración: no se envían datos reales.</span>
          </div>
          <Button className="w-full md:w-auto">Enviar registro</Button>
        </div>
      </div>
    </div>
  );
}
