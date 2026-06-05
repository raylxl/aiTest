'use client';

interface ProgressBarProps {
  progress: number;
  status?: 'normal' | 'success' | 'error';
  showText?: boolean;
  height?: number;
  animated?: boolean;
}

export default function ProgressBar({
  progress,
  status = 'normal',
  showText = true,
  height = 8,
  animated = true,
}: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  
  const statusColors = {
    normal: 'bg-[#0fc6c2]',
    success: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <div className="w-full">
      {showText && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>进度</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div
        className="w-full bg-gray-200 rounded-full overflow-hidden"
        style={{ height }}
      >
        <div
          className={`${statusColors[status]} h-full rounded-full transition-all duration-300 ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
}
