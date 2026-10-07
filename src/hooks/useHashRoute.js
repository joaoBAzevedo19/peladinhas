// Minimal hash router (#/jogos, #/jogo/<id>), which works on GitHub Pages
// without any server configuration.
import { useEffect, useState } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/jogos';
  const [path, queryString = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryString));
  return { path, segments, query };
}

export function navigate(to) {
  window.location.hash = to;
}

export function useHashRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
