import React from 'react';

const ModPlaceholder: React.FC<{ size?: number; className?: string }> = ({ 
  size = 64, 
  className = '' 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className}`}
  >
    {/* Background */}
    <rect width="64" height="64" rx="8" fill="#f3f4f6" />
    <rect width="64" height="64" rx="8" fill="url(#gradient)" />
    
    {/* Package icon */}
    <path
      d="M16 20L32 12L48 20V44L32 52L16 44V20Z"
      stroke="#6b7280"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M16 20L32 28L48 20"
      stroke="#6b7280"
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M32 28V52"
      stroke="#6b7280"
      strokeWidth="2"
      fill="none"
    />
    
    {/* Gear overlay */}
    <circle cx="40" cy="24" r="6" fill="#9ca3af" />
    <circle cx="40" cy="24" r="3" fill="#f3f4f6" />
    <path
      d="M40 18L41 21L44 21L42 23L43 26L40 24L37 26L38 23L36 21L39 21L40 18Z"
      fill="#6b7280"
    />
    
    <defs>
      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f9fafb" />
        <stop offset="100%" stopColor="#e5e7eb" />
      </linearGradient>
    </defs>
  </svg>
);

export default ModPlaceholder;
