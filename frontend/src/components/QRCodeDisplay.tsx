import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QRCodeDisplayProps {
  value: string;
  title?: string;
  showActions?: boolean;
}

export function QRCodeDisplay({ value, title = 'Código QR', showActions = true }: QRCodeDisplayProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast({
      title: 'Copiado',
      description: 'Código copiado al portapapeles',
    });
  };

  const handleDownload = () => {
    const canvas = document.createElement('canvas');
    const svg = document.querySelector('.qr-code-svg') as SVGElement;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const link = document.createElement('a');
        link.download = '/images/photo1769106392.jpg';
        link.href = canvas.toDataURL();
        link.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="bg-white p-4 rounded-lg">
          <QRCodeSVG
            value={value}
            size={256}
            level="H"
            className="qr-code-svg"
          />
        </div>
        
        {showActions && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Código
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          </div>
        )}
        
        <p className="text-xs text-gray-500 text-center break-all max-w-xs">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}