'use client';

import React from 'react';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmType?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

function WarnIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ display: 'block', flexShrink: 0 }}>
      <path fill="#FFA940" d="M512 64a448 448 0 1 1 0 896A448 448 0 0 1 512 64zm0 64a384 384 0 1 0 0 768A384 384 0 0 0 512 128zm0 192a32 32 0 0 1 32 32v192a32 32 0 0 1-64 0V352a32 32 0 0 1 32-32zm0 320a32 32 0 1 1 0 64 32 32 0 0 1 0-64z"/>
    </svg>
  );
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  confirmType = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!visible) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 8,
          width: 440,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          animation: 'confirmDialogIn 0.18s ease-out',
        }}
      >
        {/* 内容区 */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ marginTop: 2, flexShrink: 0 }}>
            <WarnIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 14, color: '#595959', lineHeight: 1.6, wordBreak: 'break-all' }}>{message}</div>
          </div>
        </div>
        {/* 按钮区 */}
        <div style={{ padding: '12px 16px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              height: 32, padding: '0 20px',
              border: '1px solid #d9d9d9', borderRadius: 4,
              background: '#fff', color: '#595959',
              fontSize: 13, cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00BEBE'; (e.currentTarget as HTMLButtonElement).style.color = '#00BEBE'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d9d9d9'; (e.currentTarget as HTMLButtonElement).style.color = '#595959'; }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: '0 20px',
              border: 'none', borderRadius: 4,
              background: confirmType === 'danger' ? '#ff4d4f' : '#00BEBE',
              color: '#fff', fontSize: 13, cursor: 'pointer',
              transition: 'background 0.15s',
              fontFamily: 'inherit',
              boxShadow: confirmType === 'danger' ? '0 2px 0 rgba(255,77,79,0.1)' : '0 2px 0 rgba(22,99,196,0.1)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = confirmType === 'danger' ? '#ff7875' : '#3880d0'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = confirmType === 'danger' ? '#ff4d4f' : '#00BEBE'; }}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes confirmDialogIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
