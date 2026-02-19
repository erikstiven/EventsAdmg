import React from 'react';
import { InfinitySpin } from 'react-loader-spinner';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Cargando...',
  fullScreen = true,
  className = '',
}) => {
  const containerClass = fullScreen
    ? 'min-h-screen flex items-center justify-center bg-gray-50'
    : 'flex items-center justify-center py-12';

  return (
    <div className={`${containerClass} ${className}`.trim()}>
      <div className="text-center">
        <InfinitySpin width="160" color="#1d4ed8" />
        <p className="mt-4 text-gray-600">{message}</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;
