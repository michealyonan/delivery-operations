import { useEffect, useState } from 'react';

import { Body } from './ui';

export function BreakCountdown({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const firstUpdate = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(firstUpdate);
      clearInterval(timer);
    };
  }, []);

  const remaining = Math.max(0, Math.ceil((new Date(until).getTime() - (now ?? 0)) / 1_000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const countdown = minutes > 0
    ? `${minutes.toLocaleString('ar-EG')} دقيقة و ${seconds.toLocaleString('ar-EG')} ثانية`
    : `${seconds.toLocaleString('ar-EG')} ثانية`;

  return <Body>{now === null ? 'جارٍ حساب الوقت المتبقي...' : `الوقت المتبقي: ${countdown}`}</Body>;
}
