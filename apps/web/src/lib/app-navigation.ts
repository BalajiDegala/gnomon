import { useCallback, useEffect, useState } from 'react';

import { appViewFromPath, appViewPath, type AppView } from '../navigation';

function viewFromCurrentPath(): AppView {
  return appViewFromPath(window.location.pathname) ?? 'overview';
}

export function useAppNavigation(
  allowedViews: ReadonlySet<AppView>,
  confirmNavigation: () => boolean = () => true,
) {
  const [requestedView, setRequestedView] = useState<AppView>(viewFromCurrentPath);
  const activeView = allowedViews.has(requestedView) ? requestedView : 'overview';

  useEffect(() => {
    const handleHistoryChange = () => {
      const nextView = viewFromCurrentPath();
      if (nextView !== activeView && !confirmNavigation()) {
        window.history.pushState({ view: activeView }, '', appViewPath(activeView));
        return;
      }
      setRequestedView(nextView);
    };
    window.addEventListener('popstate', handleHistoryChange);
    return () => window.removeEventListener('popstate', handleHistoryChange);
  }, [activeView, confirmNavigation]);

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
      if (destination !== activeView && !confirmNavigation()) return;
      const path = appViewPath(destination);
      if (window.location.pathname !== path) {
        window.history.pushState({ view: destination }, '', path);
      }
      setRequestedView(destination);
    },
    [activeView, allowedViews, confirmNavigation],
  );

  return { activeView, navigate };
}
