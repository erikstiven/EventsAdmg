import { authSimple } from '@/lib/auth-simple';

type BiometriaResponse = {
  aprobado: boolean;
  similitud: number;
};

export const biometriaService = {
  verificar: async (
    invitadoId: number,
    embedding: number[],
    capturedImageBase64?: string
  ): Promise<BiometriaResponse> => {
    const res = await authSimple.fetch('/biometria/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitadoId,
        embedding,
        captured_image_base64: capturedImageBase64 || null,
      }),
    });
    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || 'Error al validar biometría');
    }
    return await res.json();
  },
};
