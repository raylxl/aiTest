'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  maxWidth?: number;
}

export default function Tooltip({ children, content, maxWidth = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  // 初始化和内容变化时检测是否溢出
  useEffect(() => {
    if (!content) { setOverflow(false); return; }
    const el = textRef.current;
    if (!el) return;
    // scrollWidth > clientWidth 表示文字被截断
    const isOverflow = el.scrollWidth > el.clientWidth + 1;
    setOverflow(isOverflow);
  }, [content]);

  // 计算气泡最优位置
  const getTooltipStyle = useCallback(() => {
    const el = textRef.current;
    if (!el) return { left: 0, top: 0, maxWidth };
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const tooltipWidth = Math.min(maxWidth, viewportWidth - 16);
    const tooltipHeight = 40;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, viewportWidth - tooltipWidth - 8));

    const preferredTop = rect.top + rect.height + 6;
    const top = preferredTop + tooltipHeight > viewportHeight - 8
      ? rect.top - tooltipHeight - 6
      : preferredTop;

    return { left, top, maxWidth: tooltipWidth };
  }, [maxWidth]);

  if (!content) return <>{children}</>;

  return (
    <>
      <span
        ref={textRef}
        style={{
          display: 'inline-block',
          width: '100%',
          maxWidth: maxWidth,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          verticalAlign: 'bottom',
        }}
        onMouseEnter={() => { if (overflow) setVisible(true); }}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      {visible && (
        <span
          style={{
            position: 'fixed',
            zIndex: 99999,
            ...getTooltipStyle(),
            padding: '6px 10px',
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            fontSize: 12,
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.20)',
          }}
        >
          {content}
        </span>
      )}
    </>
  );
}
