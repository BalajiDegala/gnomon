import { useCallback, useEffect, useState } from 'react';

import { appViewFromPath, appViewPath, type AppView } from '../navigation';

function viewFromCurrentPath(): AppView {
  return appViewFromPath(window.location.pathname) ?? 'overview';
}

export function useAppNavigation(allowedViews: ReadonlySet<AppView>) {
  const [requestedView, setRequestedView] = useState<AppView>(viewFromCurrentPath);
  const activeView = allowedViews.has(requestedView) ? requestedView : 'overview';

  useEffect(() => {
    const handleHistoryChange = () => setRequestedView(viewFromCurrentPath());
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, []);

  useEffect(() => {
    const canonicalPath = appViewPath(activeView);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({ view: activeView }, '', canonicalPath);
    }
    if (requestedView !== activeView) setRequestedView(activeView);
  }, [activeView, requestedView]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeView]);

  const navigate = useCallback(
    (view: AppView) => {
      const destination = allowedViews.has(view) ? view : 'overview';
      const path = appViewPath(destination);
      if (window.location.pathname !== path) {
        window.history.pushState({ view: destination }, '', path);
      }
      setRequestedView(destination);
    },
    [allowedViews],
  );

  return { activeView, navigate };
}
